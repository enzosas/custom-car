import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { Terreno } from './Terreno';
import { Estrada, PASSO } from './Estrada';
import { Floresta } from './Floresta';
import { Grama, gerarGeometriaTufo } from './Grama';
import { gerarGeometriasArvore } from './Arvore';
import { geometriaDe } from '@/graphics/Malha';

const COR_GRAMA = [0.34, 0.7, 0.56];

/** chunks novos montados por frame enquanto o carro anda (carga inicial e mudanças do painel montam tudo de uma vez) */
const CHUNKS_POR_FRAME = 3;
/** ...e também limitados por tempo: um chunk com a pista dentro custa ~10-20 ms, então para de montar quando passa disso (sempre faz ao menos 1) */
const ORCAMENTO_MS = 6;

/** `pooled`: o mesh vem do pool (malha comum de grade); senão é uma malha própria do chunk, com a pista dentro */
interface ChunkAtivo { mesh: THREE.Mesh; pooled: boolean; cx: number; cz: number }

export class WorldBuilder {
    public terreno = new Terreno();
    public estrada = new Estrada(this.terreno);
    public floresta = new Floresta();
    public grama = new Grama();

    /** todos os meshes de chunk ficam aqui dentro */
    public readonly terrenoGrupo = new THREE.Group();
    public gramaMesh!: THREE.InstancedMesh;

    public florestaMeshes: THREE.InstancedMesh[][] = [[], [], [], []];
    public florestaLotes: Float32Array[] = [];
    private florestaAttrs: THREE.InstancedBufferAttribute[] = [];
    private florestaCap = 0;

    private gramaAttr!: THREE.InstancedBufferAttribute;
    public gramaLote = new Float32Array(0);
    private gramaCap = 0;

    /** semente do mundo (o ruído do relevo depende dela; mais tarde a pista também) */
    public seedPista = 0;

    // --- terreno em chunks ---
    private chunks = new Map<string, ChunkAtivo>();
    private livres: THREE.Mesh[] = [];          // meshes reaproveitados (nunca recriados: evita dispose de buffers compartilhados)
    private indiceAttr: THREE.BufferAttribute | null = null;   // compartilhado por todos os chunks
    private corAttr: THREE.BufferAttribute | null = null;      // idem
    private scratchPos = new Float32Array(0);              // vértices do chunk em construção
    private gradeCelulas = 0;
    private gradeTamanho = 0;
    private ultCx = NaN;
    private ultCz = NaN;
    private faltaConstruir = true;

    /** `matOpaco` é compartilhado com o Jogo (quem o cria também o descarta). */
    constructor(private matOpaco: THREE.ShaderMaterial, private config = GAME_CONFIG) {
        this.terreno.estrada = this.estrada;   // o terreno é derivado da pista
    }

    // 1. Inicialização
    iniciar(seed: number) {
        this.definirSeed(seed);

        // Grama
        this.gramaMesh = new THREE.InstancedMesh(geometriaDe(gerarGeometriaTufo(this.config)), this.matOpaco, 1);
        this.gramaMesh.frustumCulled = false;
        this.gramaMesh.count = 0;

        // Floresta
        this.construirFlorestaGeometrias();
    }

    /** troca a semente do mundo; o chamador reconstrói o terreno (reconstruirTerreno) e a vegetação em seguida */
    definirSeed(seed: number) {
        this.seedPista = seed;
        this.terreno.definirSeed(seed);
        this.estrada.reiniciar(seed);   // depois do terreno: a cota da pista vem do relevo
        this.floresta.definirSeed(seed);
        this.grama.definirSeed(seed);
    }

    // 2. Terreno em chunks

    /** (re)cria os buffers compartilhados quando o número de células por chunk muda */
    private prepararGrade() {
        const celulas = this.terreno.celulasPorChunk;
        if (this.indiceAttr && celulas === this.gradeCelulas) return;

        this.descartarChunks();   // a topologia mudou: todos os chunks e os buffers compartilhados são recriados

        const n = celulas + 1;
        const cores = new Float32Array(n * n * 3);
        for (let i = 0; i < cores.length; i += 3) {
            cores[i] = COR_GRAMA[0]; cores[i + 1] = COR_GRAMA[1]; cores[i + 2] = COR_GRAMA[2];
        }
        this.indiceAttr = new THREE.BufferAttribute(this.terreno.gerarIndices(), 1);
        this.corAttr = new THREE.BufferAttribute(cores, 3);
        this.scratchPos = new Float32Array(n * n * 3);
        this.gradeCelulas = celulas;
    }

    private descartarChunks() {
        for (const m of this.terrenoGrupo.children) (m as THREE.Mesh).geometry.dispose();
        this.terrenoGrupo.clear();
        this.chunks.clear();
        this.livres = [];
        this.floresta.limpar();
        this.grama.limpar();
        this.faltaConstruir = true;
    }

    /** malha comum: volta ao pool; malha própria (chunk com pista): sai da cena e a geometria é descartada */
    private soltarChunk(ch: ChunkAtivo) {
        if (ch.pooled) {
            ch.mesh.visible = false;
            this.livres.push(ch.mesh);
        } else {
            this.terrenoGrupo.remove(ch.mesh);
            ch.mesh.geometry.dispose();
        }
    }

    /** devolve todos os chunks ativos (ficam invisíveis até serem reconstruídos) */
    private liberarTodos() {
        for (const ch of this.chunks.values()) this.soltarChunk(ch);
        this.chunks.clear();
        this.floresta.limpar();
        this.grama.limpar();
        this.ultCx = NaN; this.ultCz = NaN;
        this.faltaConstruir = true;
    }

    private criarMeshChunk(): THREE.Mesh {
        const n = this.gradeCelulas + 1;
        const geo = new THREE.BufferGeometry();
        const pos = new THREE.BufferAttribute(new Float32Array(n * n * 3), 3);
        pos.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', pos);
        geo.setAttribute('color', this.corAttr!);
        geo.setIndex(this.indiceAttr!);
        const mesh = new THREE.Mesh(geo, this.matOpaco);
        mesh.frustumCulled = false;
        this.terrenoGrupo.add(mesh);
        return mesh;
    }

    private construirChunk(cx: number, cz: number) {
        const tam = this.terreno.tamanhoChunk;
        this.terreno.preencherChunk(cx, cz, this.scratchPos);

        // Chunk que a pista atravessa: malha PRÓPRIA, com a grama e o asfalto juntos e vértices compartilhados nas bordas.
        // Os triângulos do terreno sob o asfalto não existem (foram trocados por pedaços de asfalto e de grama), então não
        // há duas superfícies no mesmo lugar e nada de z-fighting. Os demais chunks usam a malha comum, em pool.
        const malha = this.estrada.gerarMalhaTerrenoChunk(cx, cz, tam, this.terreno.espacamento, this.gradeCelulas, this.scratchPos, COR_GRAMA);
        let mesh: THREE.Mesh;
        if (malha) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(malha.positions, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(malha.colors, 3));
            geo.setIndex(new THREE.BufferAttribute(malha.indices, 1));
            mesh = new THREE.Mesh(geo, this.matOpaco);
            mesh.frustumCulled = false;
            this.terrenoGrupo.add(mesh);
        } else {
            mesh = this.livres.pop() ?? this.criarMeshChunk();
            const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
            (pos.array as Float32Array).set(this.scratchPos);
            pos.needsUpdate = true;
        }
        mesh.position.set(cx * tam, 0, cz * tam);
        mesh.visible = true;

        const chave = `${cx},${cz}`;
        this.chunks.set(chave, { mesh, pooled: !malha, cx, cz });

        // a vegetação nasce junto com o chunk (sorteio determinístico por chunk)
        this.floresta.adicionarChunk(chave, cx, cz, tam, this.terreno, this.estrada);
        this.grama.adicionarChunk(chave, cx, cz, tam, this.terreno, this.estrada);
    }

    /** garante buffers de instância grandes o bastante para tudo que está carregado (com folga, para não realocar a cada chunk) */
    private garantirCapacidades() {
        this.garantirCapacidadeFloresta(Math.max(1, Math.ceil(this.floresta.quantidade * 1.25) + 256));
        this.garantirCapacidadeGrama(Math.max(1, Math.ceil(this.grama.quantidade * 1.25) + 256));
    }

    /**
     * Mantém carregados os chunks num círculo de `raioChunks` em volta de (x, z): descarta os que ficaram
     * longe (com histerese, para não oscilar na borda) e monta até `orcamento` dos que faltam, do mais
     * perto para o mais longe. Devolve quantos montou.
     */
    atualizarChunks(x: number, z: number, orcamento = CHUNKS_POR_FRAME): number {
        this.prepararGrade();
        const tam = this.terreno.tamanhoChunk;
        if (tam !== this.gradeTamanho) { this.liberarTodos(); this.gradeTamanho = tam; }

        const ccx = Math.floor(x / tam), ccz = Math.floor(z / tam);
        if (ccx === this.ultCx && ccz === this.ultCz && !this.faltaConstruir) return 0;
        this.ultCx = ccx; this.ultCz = ccz;

        const R = this.terreno.raioChunks;
        const limCria = (R + 0.5) * (R + 0.5), limLibera = (R + 1.5) * (R + 1.5);

        // a pista precisa existir (com cota final) em toda a faixa de z dos chunks carregados, mais o alcance da
        // transição; senão o terreno de um chunk seria montado sem a pista que ainda vai passar por ele
        const cobertura = (R + 2) * tam + this.estrada.raioTotal + 4 * PASSO;
        this.estrada.garantirCobertura(z - cobertura, z + cobertura);

        for (const [chave, ch] of this.chunks) {
            const dx = ch.cx - ccx, dz = ch.cz - ccz;
            if (dx * dx + dz * dz > limLibera) {
                this.soltarChunk(ch);
                this.chunks.delete(chave);
                this.floresta.remover(chave);
                this.grama.remover(chave);
            }
        }

        const faltando: { cx: number; cz: number; d: number }[] = [];
        for (let dz = -R - 1; dz <= R + 1; ++dz) {
            for (let dx = -R - 1; dx <= R + 1; ++dx) {
                const d = dx * dx + dz * dz;
                if (d > limCria) continue;
                if (!this.chunks.has(`${ccx + dx},${ccz + dz}`)) faltando.push({ cx: ccx + dx, cz: ccz + dz, d });
            }
        }
        faltando.sort((a, b) => a.d - b.d);

        let feitos = 0;
        const t0 = performance.now(), limitarTempo = Number.isFinite(orcamento);
        for (const f of faltando) {
            if (feitos >= orcamento) break;
            if (limitarTempo && feitos > 0 && performance.now() - t0 > ORCAMENTO_MS) break;
            this.construirChunk(f.cx, f.cz);
            feitos++;
        }
        this.faltaConstruir = faltando.length > feitos;
        this.garantirCapacidades();
        return feitos;
    }

    /** descarta e remonta todo o terreno de uma vez (parâmetros do painel, nova seed) */
    reconstruirTerreno(x: number, z: number) {
        this.estrada.reiniciar(this.seedPista);   // a pista depende do relevo e dos parâmetros dela
        this.liberarTodos();
        this.atualizarChunks(x, z, Infinity);
    }

    /**
     * No passe de sombra (caixa de ±1200 em volta do carro) só o chunk do carro e seus 8 vizinhos
     * podem projetar sombra no que importa; os demais ficam fora desse passe para economizar vértices.
     */
    modoSombra(ligado: boolean, x: number, z: number) {
        if (!ligado) {
            for (const ch of this.chunks.values()) ch.mesh.visible = true;
            return;
        }
        const tam = this.terreno.tamanhoChunk;
        const ccx = Math.floor(x / tam), ccz = Math.floor(z / tam);
        for (const ch of this.chunks.values()) {
            ch.mesh.visible = Math.abs(ch.cx - ccx) <= 1 && Math.abs(ch.cz - ccz) <= 1;
        }
    }

    /** libera as malhas dos chunks (ao descartar o jogo) */
    dispose() { this.descartarChunks(); }

    // 3. Vegetação
    /** refaz a vegetação de todos os chunks carregados (parâmetros de árvore/grama mudaram no painel) */
    regerarVegetacao() {
        this.floresta.limpar();
        this.grama.limpar();
        const tam = this.terreno.tamanhoChunk;
        for (const [chave, ch] of this.chunks) {
            this.floresta.adicionarChunk(chave, ch.cx, ch.cz, tam, this.terreno, this.estrada);
            this.grama.adicionarChunk(chave, ch.cx, ch.cz, tam, this.terreno, this.estrada);
        }
        this.garantirCapacidades();
    }

    // --- Helpers de Geometria e Instancing ---

    construirFlorestaGeometrias() {
        const g = gerarGeometriasArvore(this.config);
        const grupos = [g.lod0, g.lod1, g.lod2, g.lod3];
        grupos.forEach((malhas, k) => {
            malhas.forEach((m, j) => {
                const geo = geometriaDe(m);
                let mesh = this.florestaMeshes[k][j];
                if (!mesh) {
                    mesh = new THREE.InstancedMesh(geo, this.matOpaco, 1);
                    mesh.frustumCulled = false;
                    mesh.count = 0;
                    this.florestaMeshes[k][j] = mesh;
                } else {
                    mesh.geometry.dispose();
                    mesh.geometry = geo;
                }
            });
        });
        this.garantirCapacidadeFloresta(Math.max(1, this.config.arvore.arvores.quantidade));
    }

    private garantirCapacidadeFloresta(qtd: number) {
        if (qtd <= this.florestaCap && this.florestaAttrs.length === 4) return;
        this.florestaCap = Math.max(qtd, this.florestaCap);
        this.florestaLotes = []; this.florestaAttrs = [];
        for (let k = 0; k < 4; ++k) {
            const arr = new Float32Array(this.florestaCap * 16);
            const attr = new THREE.InstancedBufferAttribute(arr, 16);
            attr.setUsage(THREE.DynamicDrawUsage);
            this.florestaLotes.push(arr); this.florestaAttrs.push(attr);
            for (const mesh of this.florestaMeshes[k]) mesh.instanceMatrix = attr;
        }
    }

    garantirCapacidadeGrama(qtd: number) {
        if (qtd <= this.gramaCap && this.gramaAttr) return;
        this.gramaCap = Math.max(qtd, this.gramaCap, 1);
        this.gramaLote = new Float32Array(this.gramaCap * 16);
        this.gramaAttr = new THREE.InstancedBufferAttribute(this.gramaLote, 16);
        this.gramaAttr.setUsage(THREE.DynamicDrawUsage);
        this.gramaMesh.instanceMatrix = this.gramaAttr;
    }

    atualizarGrama() {
        if (this.gramaAttr) this.gramaAttr.needsUpdate = true;
    }

    atualizarFlorestaLods(ref: { x: number; y: number; z: number }, sombraPass: boolean) {
        const cont = this.floresta.selecionar(ref, sombraPass, this.florestaLotes);
        for (let k = 0; k < 4; ++k) {
            this.florestaAttrs[k].needsUpdate = true;
            for (const mesh of this.florestaMeshes[k]) {
                mesh.count = cont[k];
                mesh.visible = cont[k] > 0;
            }
        }
    }

    /**
     * Altura da superfície sob (x, z): só o terreno. O asfalto está no mesmo plano dele (a pista molda o terreno e o
     * asfalto é recortado dos seus triângulos), então não existe mais troca de plano ao entrar na pista.
     * `offsetprofundidadegrama` (0 por padrão) ainda afunda a grama em relação ao asfalto, se o usuário quiser.
     */
    alturaSuperficie = (x: number, z: number): number => {
        const h = this.terreno.obterAlturaMundo(x, z);
        const off = this.config.terreno.superficie.offsetprofundidadegrama;
        if (off !== 0 && !this.estrada.estaNoAsfalto(x, z)) return h - off;
        return h;
    };

}