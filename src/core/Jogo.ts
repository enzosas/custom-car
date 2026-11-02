// Jogo.ts - motor do jogo
import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { Terreno } from '@/world/Terreno';
import { Estrada } from '@/world/Estrada';
import { Veiculo, type Malha } from '@/entities/Veiculo';
import { CameraJogo } from '@/entities/Camera';
import { Floresta } from '@/world/Floresta';
import { Grama, gerarGeometriaTufo } from '@/world/Grama';
import { gerarGeometriasArvore } from '@/world/Arvore';
import { RastroPneu } from '@/graphics/RastroPneu';
import { SistemaParticulas } from '@/graphics/Particulas';
import { PilotoAutomatico } from '@/entities/PilotoAutomatico';
import { PainelConfig } from '@/ui/PainelConfig';
import { Entrada } from './Input';
import { TouchHUD } from '@/ui/TouchHUDController';
import { Mat4 } from '@/graphics/Mat4';
import { Renderer } from '@/graphics/Renderer';
import { randGlobal, sementeAleatoria } from './Random';
import {
    criarUniformsCompartilhados,
    criarMaterialPrincipal,
    criarMaterialRastro,
    criarMaterialParticula,
    atualizarLuz,
} from '@/graphics/materialPrincipal';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const COR_GRAMA = [0.34, 0.7, 0.56];

function geometriaDe(m: Malha): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return g;
}

const mudou = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

// Presets iniciais de fábrica
const CONFIG_CARRO_PADRAO = {
    dimensoes: { largura: 10.0, comprimento: 20.0, alturachao: 2.0, alturaporta: 4.5, alturaparabrisa: 4.5, comprimentorodas: 13.0, largurarodas: 10.0, offsetchassi: 0.0, taxaBaseCockpitTras: 0.1, taxaTopoCockpitTras: 0.2, taxaTopoCockpitFrente: 0.6, taxaBaseCockpitFrente: 0.7 },
    rodas: { raio: 2.0, largura: 1.5, segmentos: 16 },
    fisica: { aceleracao: 0.03, aceleracaoFreio: 0.04, velmax: 7.0, velmaxre: -2.0, anguloVolanteMax: 0.7, velocidadeGiro: 0.03, taxaLerpVolante: 0.035, aderenciaFreioDeMao: 0.015, aderenciaPista: 0.03, atritoEscalar: 0.9999, atritoLinear: 0.001, arrastoQuadratico: 0.0, suspensaoRigidez: 150.0, suspensaoAmortecimento: 8.0, suspensaoInclinacaoMax: 8.0, velReferenciaGiro: 0.5, taxaRecuperacaoGrip: 0.02, forcaPulo: 70.0, gravidade: 150.0, fatorPuloMinimo: 0.55, tempoCargaPulo: 0.6, compressaoPulo: 1.4, reacaoPouso: 1.0, limiarDecolagem: 10.0, limiarDriftRastro: 0.9 }
};

const CONFIG_CARRO_GLB = {
    dimensoes: { largura: 10.0, comprimento: 40.0, alturachao: 2.0, alturaporta: 4.5, alturaparabrisa: 4.5, comprimentorodas: 26.5, largurarodas: 16.5, offsetchassi: 0.100, taxaBaseCockpitTras: 0.1, taxaTopoCockpitTras: 0.2, taxaTopoCockpitFrente: 0.6, taxaBaseCockpitFrente: 0.7 },
    rodas: { raio: 3.2, largura: 1.5, segmentos: 16 },
    fisica: { aceleracao: 0.03, aceleracaoFreio: 0.04, velmax: 7.0, velmaxre: -2.0, anguloVolanteMax: 0.7, velocidadeGiro: 0.03, taxaLerpVolante: 0.035, aderenciaFreioDeMao: 0.015, aderenciaPista: 0.03, atritoEscalar: 0.9999, atritoLinear: 0.001, arrastoQuadratico: 0.0, suspensaoRigidez: 80.0, suspensaoAmortecimento: 8.0, suspensaoInclinacaoMax: 8.0, velReferenciaGiro: 0.5, taxaRecuperacaoGrip: 0.02, forcaPulo: 70.0, gravidade: 150.0, fatorPuloMinimo: 0.55, tempoCargaPulo: 0.6, compressaoPulo: 1.4, reacaoPouso: 1.0, limiarDecolagem: 10.0, limiarDriftRastro: 0.9 }
};

export class Jogo {
    readonly config = GAME_CONFIG;
    private configAnterior: any = JSON.parse(JSON.stringify(GAME_CONFIG));

    // Three.js
    private renderizador: Renderer;
    private uniforms = criarUniformsCompartilhados();
    private matOpaco = criarMaterialPrincipal(this.uniforms);
    private matRastro = criarMaterialRastro(this.uniforms);
    private matParticula = criarMaterialParticula();

    // Subsistemas
    private terreno = new Terreno();
    private estrada = new Estrada();
    private veiculo = new Veiculo();
    private floresta = new Floresta();
    private grama = new Grama();
    private rastroPneus = new RastroPneu(GAME_CONFIG.carro.rodas.largura, 8.0);
    private particulas = new SistemaParticulas();
    private pilotoAuto = new PilotoAutomatico();
    private cam = new CameraJogo();
    private painel: PainelConfig;

    // Malhas e nós
    private terrenoMesh!: THREE.Mesh;
    private terrenoPos!: THREE.BufferAttribute;
    private estradaMesh: THREE.Mesh | null = null;
    private chassiMesh!: THREE.Group;
    private modeloCarroAtual: THREE.Object3D | null = null;
    private bboxOriginalCarro = new THREE.Box3();
    private rodasMesh: THREE.Mesh[] = [];
    private florestaMeshes: THREE.InstancedMesh[][] = [[], [], [], []];
    private florestaAttrs: THREE.InstancedBufferAttribute[] = [];
    private florestaLotes: Float32Array[] = [];
    private florestaCap = 0;
    private gramaMesh!: THREE.InstancedMesh;
    private gramaAttr!: THREE.InstancedBufferAttribute;
    private gramaLote = new Float32Array(0);
    private gramaCap = 0;
    private rastroMesh!: THREE.Mesh;
    private rastroBuf = { pos: new Float32Array(0), cor: new Float32Array(0) };
    private particulasMesh!: THREE.Mesh;
    private particulasBuf = { pos: new Float32Array(0), cor: new Float32Array(0) };

    // Estado geral
    private wireframe = false;
    private estavaDerrapandoAnterior = false;
    private shiftAnterior = false;
    private carregandoPulo = false;
    private seedPista = 0;
    private terrenoDefasado = false;
    private vegetacaoPendente = false;
    private trabalhoPesadoNoFrame = false;
    private proximaRegenTerreno = 0;
    private lastTime = 0;
    private rafId = 0;
    private rodando = false;
    private descartado = false;
    private hud: HTMLDivElement;
    private dropOverlay: HTMLDivElement | null = null;

    private fps = { t: 0, n: 0, v: 0 };
    private camOffsetX = 0;
    private camOffsetY = 0;

    private modoCarroGLB = false;
    private modeloGLBCache: THREE.Group | null = null;
    private malhaChassiProcedural: THREE.Mesh | null = null;
    private estadoCarroVermelho = JSON.parse(JSON.stringify(CONFIG_CARRO_PADRAO));
    private estadoCarroGLB = JSON.parse(JSON.stringify(CONFIG_CARRO_GLB));
    private historicoFreioMao: number[] = [];
    private freioMaoPressionadoAnterior = false;
    private removerDragAndDrop: () => void = () => { };

    constructor(private canvas: HTMLCanvasElement, private hostUI: HTMLElement) {
        this.renderizador = new Renderer(canvas, this.uniforms);
        this.painel = new PainelConfig(hostUI, this.config);

        this.hud = document.createElement('div');
        Object.assign(this.hud.style, {
            position: 'absolute', right: '10px', top: '8px', color: '#000',
            font: '12px/1.5 monospace', textAlign: 'right', pointerEvents: 'none',
            whiteSpace: 'pre', userSelect: 'none',
        } as CSSStyleDeclaration);
        hostUI.appendChild(this.hud);

        Entrada.iniciar(canvas);
    }

    async iniciar(urlTerreno = './terreno.raw') {
        Object.assign(this.config.carro.dimensoes, this.estadoCarroVermelho.dimensoes);
        Object.assign(this.config.carro.rodas, this.estadoCarroVermelho.rodas);
        Object.assign(this.config.carro.fisica, this.estadoCarroVermelho.fisica);

        const resp = await fetch(urlTerreno);
        if (this.descartado) return;
        if (!resp.ok) throw new Error(`${urlTerreno} não encontrado (coloque terreno.raw em /public)`);
        const buffer = await resp.arrayBuffer();
        if (this.descartado) return;

        this.terreno.carregarRaw(buffer);
        this.veiculo.init();

        const pos = this.terreno.gerarPosicoes();
        const cores = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
            cores[i] = COR_GRAMA[0];
            cores[i + 1] = COR_GRAMA[1];
            cores[i + 2] = COR_GRAMA[2];
        }

        const gt = new THREE.BufferGeometry();
        this.terrenoPos = new THREE.BufferAttribute(pos, 3);
        this.terrenoPos.setUsage(THREE.DynamicDrawUsage);
        gt.setAttribute('position', this.terrenoPos);
        gt.setAttribute('color', new THREE.BufferAttribute(cores, 3));
        gt.setIndex(new THREE.BufferAttribute(this.terreno.gerarIndices(), 1));
        this.terrenoMesh = new THREE.Mesh(gt, this.matOpaco);
        this.terrenoMesh.frustumCulled = false;
        this.renderizador.scene.add(this.terrenoMesh);

        this.chassiMesh = new THREE.Group();
        this.chassiMesh.matrixAutoUpdate = false;
        this.chassiMesh.frustumCulled = false;
        this.renderizador.scene.add(this.chassiMesh);

        this.malhaChassiProcedural = new THREE.Mesh(geometriaDe(this.veiculo.gerarMalhaChassi()), this.matOpaco);
        this.malhaChassiProcedural.frustumCulled = false;
        this.malhaChassiProcedural.matrixAutoUpdate = true;
        this.chassiMesh.add(this.malhaChassiProcedural);

        const geoRoda = geometriaDe(this.veiculo.gerarMalhaRoda());
        this.rodasMesh = [];
        for (let i = 0; i < 4; ++i) {
            const m = new THREE.Mesh(geoRoda, this.matOpaco);
            m.frustumCulled = false;
            m.matrixAutoUpdate = false;
            this.rodasMesh.push(m);
            this.renderizador.scene.add(m);
        }

        const loader = new GLTFLoader();
        loader.load(
            './carro.glb',
            (gltf) => {
                const modelo = gltf.scene;
                modelo.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;
                        mesh.frustumCulled = false;
                        if (mesh.material) {
                            const mat = mesh.material as THREE.MeshStandardMaterial;
                            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                        }
                    }
                });
                this.modeloGLBCache = modelo;
            },
            undefined,
            () => { console.log('carro.glb não encontrado em /public. Pode arrastar um ficheiro .glb para testar.'); }
        );

        this.configurarDragAndDrop();
        this.construirFlorestaGeometrias();
        this.gramaMesh = new THREE.InstancedMesh(geometriaDe(gerarGeometriaTufo(this.config)), this.matOpaco, 1);
        this.gramaMesh.frustumCulled = false;
        this.gramaMesh.count = 0;
        this.renderizador.scene.add(this.gramaMesh);

        const gr = new THREE.BufferGeometry();
        this.rastroMesh = new THREE.Mesh(gr, this.matRastro);
        this.rastroMesh.frustumCulled = false;
        this.renderizador.scene.add(this.rastroMesh);

        const gp = new THREE.BufferGeometry();
        this.particulasMesh = new THREE.Mesh(gp, this.matParticula);
        this.particulasMesh.frustumCulled = false;
        this.renderizador.scene.add(this.particulasMesh);

        const s = Number(new URLSearchParams(location.search).get('seed'));
        if (Number.isFinite(s) && s > 0) this.seedPista = s >>> 0;
        this.regenerarPista(this.seedPista === 0, true);
        this.configAnterior = JSON.parse(JSON.stringify(this.config));

        console.log('X: alternar carro | 10x Travão de Mão em 5s: alternar carro | Q: wireframe | R: pista');
        this.lastTime = performance.now() / 1000;
        this.rodando = true;
        this.rafId = requestAnimationFrame(this.loop);
    }

    private alternarModoCarro() {
        if (this.modoCarroGLB) {
            this.estadoCarroGLB = JSON.parse(JSON.stringify(this.config.carro));
        } else {
            this.estadoCarroVermelho = JSON.parse(JSON.stringify(this.config.carro));
        }

        this.modoCarroGLB = !this.modoCarroGLB;
        const estadoDestino = this.modoCarroGLB ? this.estadoCarroGLB : this.estadoCarroVermelho;

        Object.assign(this.config.carro.dimensoes, estadoDestino.dimensoes);
        Object.assign(this.config.carro.rodas, estadoDestino.rodas);
        Object.assign(this.config.carro.fisica, estadoDestino.fisica);

        this.veiculo.reconstruirGeometria();

        const geoRoda = geometriaDe(this.veiculo.gerarMalhaRoda());
        this.rodasMesh[0]?.geometry.dispose();
        this.rodasMesh.forEach((m) => { m.geometry = geoRoda; });
        this.rastroPneus.setLargura(this.config.carro.rodas.largura);

        while (this.chassiMesh.children.length > 0) {
            this.chassiMesh.remove(this.chassiMesh.children[0]);
        }

        if (this.modoCarroGLB) {
            if (this.modeloGLBCache) this.aplicarNovoModeloCarro(this.modeloGLBCache);
            else console.warn('Modelo GLB ainda não está em cache.');
        } else {
            this.modeloCarroAtual = null;
            if (this.malhaChassiProcedural) {
                this.malhaChassiProcedural.geometry.dispose();
                this.malhaChassiProcedural.geometry = geometriaDe(this.veiculo.gerarMalhaChassi());
                this.chassiMesh.add(this.malhaChassiProcedural);
            }
        }

        if (typeof (this.painel as any).recarregarAbaAtual === 'function') {
            (this.painel as any).recarregarAbaAtual();
        }

        this.configAnterior = JSON.parse(JSON.stringify(this.config));
    }

    public aplicarNovoModeloCarro(modelo: THREE.Object3D) {
        while (this.chassiMesh.children.length > 0) {
            this.chassiMesh.remove(this.chassiMesh.children[0]);
        }

        modelo.position.set(0, 0, 0);
        modelo.rotation.set(0, 0, 0);
        modelo.scale.set(1, 1, 1);
        modelo.updateMatrixWorld(true);

        this.bboxOriginalCarro = new THREE.Box3().setFromObject(modelo);
        this.modeloCarroAtual = modelo;

        modelo.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.frustumCulled = false;
                if (mesh.material) {
                    const mat = mesh.material as THREE.MeshStandardMaterial;
                    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                }
            }
        });

        modelo.matrixAutoUpdate = true;
        this.chassiMesh.add(modelo);
        this.atualizarTransformacaoModeloCarro();
    }

    private atualizarTransformacaoModeloCarro() {
        if (!this.modeloCarroAtual || this.bboxOriginalCarro.isEmpty()) return;
        const size = new THREE.Vector3();
        this.bboxOriginalCarro.getSize(size);
        const comprimentoAlvo = this.config.carro.dimensoes.comprimento;
        const dimMaiorOriginal = Math.max(size.z, size.x);
        const fatorEscala = dimMaiorOriginal > 0 ? comprimentoAlvo / dimMaiorOriginal : 1;
        this.modeloCarroAtual.scale.setScalar(fatorEscala);

        const center = new THREE.Vector3();
        this.bboxOriginalCarro.getCenter(center);
        this.modeloCarroAtual.position.x = -center.x * fatorEscala;
        this.modeloCarroAtual.position.z = -center.z * fatorEscala;

        const offsetBase = -3.8;
        this.modeloCarroAtual.position.y = (-this.bboxOriginalCarro.min.y * fatorEscala) + offsetBase + this.config.carro.dimensoes.alturachao;
    }

    private configurarDragAndDrop() {
        this.dropOverlay = document.createElement('div');
        Object.assign(this.dropOverlay.style, {
            position: 'fixed', inset: '0', background: 'rgba(0, 0, 0, 0.45)', border: '3px dashed #ffffff',
            display: 'none', justifyContent: 'center', alignItems: 'center', color: '#ffffff',
            fontSize: '24px', fontFamily: 'monospace', zIndex: '9999', pointerEvents: 'none',
        } as CSSStyleDeclaration);
        this.dropOverlay.textContent = 'Solte o ficheiro .glb do carro aqui';
        document.body.appendChild(this.dropOverlay);

        let dragCounter = 0;

        const tratarDragEnter = (e: DragEvent) => { e.preventDefault(); dragCounter++; if (this.dropOverlay) this.dropOverlay.style.display = 'flex'; };
        const tratarDragOver = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
        const tratarDragLeave = (e: DragEvent) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; if (this.dropOverlay) this.dropOverlay.style.display = 'none'; } };
        const tratarDrop = async (e: DragEvent) => {
            e.preventDefault();
            dragCounter = 0;
            if (this.dropOverlay) this.dropOverlay.style.display = 'none';
            const arquivos = e.dataTransfer?.files;
            if (!arquivos || arquivos.length === 0) return;
            const arquivo = arquivos[0];
            if (!arquivo.name.toLowerCase().endsWith('.glb')) { alert('Apenas ficheiros no formato .glb são suportados!'); return; }

            try {
                const buffer = await arquivo.arrayBuffer();
                const loader = new GLTFLoader();
                const gltf = await loader.parseAsync(buffer, '');
                this.modeloGLBCache = gltf.scene;
                if (!this.modoCarroGLB) {
                    this.estadoCarroVermelho = JSON.parse(JSON.stringify(this.config.carro));
                    this.modoCarroGLB = true;
                    Object.assign(this.config.carro.dimensoes, this.estadoCarroGLB.dimensoes);
                    Object.assign(this.config.carro.rodas, this.estadoCarroGLB.rodas);
                    Object.assign(this.config.carro.fisica, this.estadoCarroGLB.fisica);
                    this.veiculo.reconstruirGeometria();
                    const geoRoda = geometriaDe(this.veiculo.gerarMalhaRoda());
                    this.rodasMesh[0]?.geometry.dispose();
                    this.rodasMesh.forEach((m) => { m.geometry = geoRoda; });
                    this.rastroPneus.setLargura(this.config.carro.rodas.largura);
                    this.configAnterior = JSON.parse(JSON.stringify(this.config));
                    if (typeof (this.painel as any).recarregarAbaAtual === 'function') (this.painel as any).recarregarAbaAtual();
                }
                this.aplicarNovoModeloCarro(gltf.scene);
            } catch (err) { alert('Erro ao carregar o modelo .glb.'); }
        };

        window.addEventListener('dragenter', tratarDragEnter); window.addEventListener('dragover', tratarDragOver);
        window.addEventListener('dragleave', tratarDragLeave); window.addEventListener('drop', tratarDrop);
        this.removerDragAndDrop = () => {
            window.removeEventListener('dragenter', tratarDragEnter); window.removeEventListener('dragover', tratarDragOver);
            window.removeEventListener('dragleave', tratarDragLeave); window.removeEventListener('drop', tratarDrop);
            this.dropOverlay?.remove();
        };
    }

    private construirFlorestaGeometrias() {
        const g = gerarGeometriasArvore(this.config);
        const grupos = [g.lod0, g.lod1, g.lod2, g.lod3];
        grupos.forEach((malhas, k) => {
            malhas.forEach((m, j) => {
                const geo = geometriaDe(m);
                let mesh = this.florestaMeshes[k][j];
                if (!mesh) {
                    mesh = new THREE.InstancedMesh(geo, this.matOpaco, 1);
                    mesh.frustumCulled = false; mesh.count = 0;
                    this.florestaMeshes[k][j] = mesh;
                    this.renderizador.scene.add(mesh);
                } else {
                    mesh.geometry.dispose(); mesh.geometry = geo;
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

    private garantirCapacidadeGrama(qtd: number) {
        if (qtd <= this.gramaCap && this.gramaAttr) return;
        this.gramaCap = Math.max(qtd, this.gramaCap, 1);
        this.gramaLote = new Float32Array(this.gramaCap * 16);
        this.gramaAttr = new THREE.InstancedBufferAttribute(this.gramaLote, 16);
        this.gramaAttr.setUsage(THREE.DynamicDrawUsage);
        this.gramaMesh.instanceMatrix = this.gramaAttr;
    }

    private regerarVegetacao() {
        this.floresta.gerarArvores(this.terreno, this.estrada);
        this.grama.gerarGrama(this.terreno, this.estrada);
        this.garantirCapacidadeFloresta(Math.max(1, this.floresta.quantidade));
        this.garantirCapacidadeGrama(Math.max(1, this.grama.quantidade));
    }

    private atualizarMalhaTerreno() {
        (this.terrenoPos.array as Float32Array).set(this.terreno.gerarPosicoes());
        this.terrenoPos.needsUpdate = true;
    }

    private atualizarMalhaEstrada(m: { positions: Float32Array; colors: Float32Array; indices: Uint32Array } | null) {
        if (this.estradaMesh) {
            this.renderizador.scene.remove(this.estradaMesh);
            this.estradaMesh.geometry.dispose();
            this.estradaMesh = null;
        }
        if (!m) return;
        this.estradaMesh = new THREE.Mesh(geometriaDe(m), this.matOpaco);
        this.estradaMesh.frustumCulled = false;
        this.renderizador.scene.add(this.estradaMesh);
    }

    private gerarEstrada() {
        const malha = this.estrada.gerar(this.terreno, this.seedPista);
        this.atualizarMalhaTerreno();
        this.atualizarMalhaEstrada(malha);
    }

    private regenerarPista(novaSeed: boolean, reposicionar: boolean) {
        if (novaSeed || this.seedPista === 0) this.seedPista = sementeAleatoria();
        this.gerarEstrada();
        this.veiculo.invalidarSolo();
        if (reposicionar) {
            const curva = this.estrada.getPontosCurva();
            if (curva.length >= 2) {
                const d = { x: curva[1].x - curva[0].x, y: curva[1].y - curva[0].y, z: curva[1].z - curva[0].z };
                const l = Math.hypot(d.x, d.y, d.z) || 1;
                this.veiculo.reposicionarNaPista(curva[0], { x: d.x / l, y: d.y / l, z: d.z / l });
            }
        }
        this.regerarVegetacao();
        this.terrenoDefasado = false;
        this.vegetacaoPendente = false;
        this.trabalhoPesadoNoFrame = true;
    }

    private alturaSuperficie = (x: number, z: number): number => {
        let h = this.estrada.obterAlturaSuperficie(x, z, this.terreno);
        if (!this.estrada.estaNoAsfalto(x, z)) h -= this.config.terreno.superficie.offsetprofundidadegrama;
        return h;
    };

    private aplicarMudancasDoPainel() {
        const c = this.config, a = this.configAnterior;
        const carroMudou = mudou(c.carro.dimensoes, a.carro.dimensoes) || mudou(c.carro.rodas, a.carro.rodas);
        const arvoreMudou = mudou(c.arvore.arvores, a.arvore.arvores);
        const gramaMudou = mudou(c.grama.grama, a.grama.grama);
        const terrenoMudou = mudou(c.terreno.parametros, a.terreno.parametros) || mudou(c.estrada.estrada, a.estrada.estrada);

        if (carroMudou) {
            this.veiculo.reconstruirGeometria();
            if (this.modeloCarroAtual) {
                this.atualizarTransformacaoModeloCarro();
            } else if (this.malhaChassiProcedural) {
                this.malhaChassiProcedural.geometry.dispose();
                this.malhaChassiProcedural.geometry = geometriaDe(this.veiculo.gerarMalhaChassi());
            }
            const geoRoda = geometriaDe(this.veiculo.gerarMalhaRoda());
            this.rodasMesh[0]?.geometry.dispose();
            this.rodasMesh.forEach((m) => { m.geometry = geoRoda; });
            this.rastroPneus.setLargura(c.carro.rodas.largura);
        }

        if (arvoreMudou) { this.construirFlorestaGeometrias(); this.vegetacaoPendente = true; }
        if (gramaMudou) { this.gramaMesh.geometry.dispose(); this.gramaMesh.geometry = geometriaDe(gerarGeometriaTufo(this.config)); this.vegetacaoPendente = true; }
        if (terrenoMudou) this.terrenoDefasado = true;
        this.configAnterior = JSON.parse(JSON.stringify(c));
    }

    private processarTrabalhoPendente() {
        const arrastando = Entrada.esquerdo;
        const agora = performance.now() / 1000;
        if (this.terrenoDefasado && (!arrastando || agora >= this.proximaRegenTerreno)) {
            const inicio = performance.now() / 1000;
            this.gerarEstrada();
            this.veiculo.invalidarSolo();
            const fim = performance.now() / 1000;
            this.proximaRegenTerreno = fim + Math.max(0.15, (fim - inicio) * 3.0);
            this.terrenoDefasado = false; this.vegetacaoPendente = true; this.trabalhoPesadoNoFrame = true;
        }
        if (this.vegetacaoPendente && !arrastando) {
            this.regerarVegetacao();
            this.vegetacaoPendente = false; this.trabalhoPesadoNoFrame = true;
        }
    }

    private aplicarMatriz(obj: THREE.Object3D | undefined, m: Mat4) {
        if (!obj) return;
        obj.matrix.fromArray(m.m);
        obj.matrixWorldNeedsUpdate = true;
    }

    private atualizarFloresta(ref: { x: number; y: number; z: number }, sombraPass: boolean) {
        const cont = this.floresta.selecionar(ref, sombraPass, this.florestaLotes);
        for (let k = 0; k < 4; ++k) {
            this.florestaAttrs[k].needsUpdate = true;
            for (const mesh of this.florestaMeshes[k]) {
                mesh.count = cont[k]; mesh.visible = cont[k] > 0;
            }
        }
    }

    private renderizarSombra(lightDir: THREE.Vector3, p: { x: number; y: number; z: number }) {
        const alvo = new THREE.Vector3(p.x, p.y, p.z);
        this.renderizador.sombra.atualizarMatriz(lightDir, alvo);
        this.gramaMesh.visible = false;
        this.rastroMesh.visible = false;
        this.particulasMesh.visible = false;
        this.atualizarFloresta(p, true);

        const r = this.renderizador.renderer;
        r.setRenderTarget(this.renderizador.sombra.alvo);
        r.clear(true, true, false);
        this.renderizador.scene.overrideMaterial = this.renderizador.sombra.materialProfundidade;
        r.render(this.renderizador.scene, this.renderizador.camera);
        this.renderizador.scene.overrideMaterial = null;
        r.setRenderTarget(null);

        this.uniforms.uShadowOn.value = 1;
        this.gramaMesh.visible = true;
        this.rastroMesh.visible = true;
        this.particulasMesh.visible = true;
    }

    private atualizarDinamicos(camRight: THREE.Vector3, camUp: THREE.Vector3) {
        const nR = this.rastroPneus.gerarGeometria(this.rastroBuf);
        this.sincronizarBuffer(this.rastroMesh.geometry, 'position', this.rastroBuf.pos, 3, nR);
        this.sincronizarBuffer(this.rastroMesh.geometry, 'color', this.rastroBuf.cor, 3, nR);
        this.rastroMesh.geometry.setDrawRange(0, nR);
        this.rastroMesh.visible = nR > 0;

        const nP = this.particulas.gerarGeometria({ x: camRight.x, y: camRight.y, z: camRight.z }, { x: camUp.x, y: camUp.y, z: camUp.z }, this.particulasBuf);
        this.sincronizarBuffer(this.particulasMesh.geometry, 'position', this.particulasBuf.pos, 3, nP);
        this.sincronizarBuffer(this.particulasMesh.geometry, 'aCor', this.particulasBuf.cor, 4, nP);
        this.particulasMesh.geometry.setDrawRange(0, nP);
        this.particulasMesh.visible = nP > 0;
    }

    private sincronizarBuffer(geo: THREE.BufferGeometry, nome: string, arr: Float32Array, itemSize: number, _n: number) {
        const atual = geo.getAttribute(nome) as THREE.BufferAttribute | undefined;
        if (!atual || atual.array !== arr) {
            const a = new THREE.BufferAttribute(arr, itemSize);
            a.setUsage(THREE.DynamicDrawUsage);
            geo.setAttribute(nome, a);
        } else {
            atual.needsUpdate = true;
        }
    }

    private loop = () => {
        if (!this.rodando) return;
        this.rafId = requestAnimationFrame(this.loop);
        this.trabalhoPesadoNoFrame = false;

        const w = window.innerWidth, h = window.innerHeight;
        if (w === 0 || h === 0) return;

        if (Entrada.teclaUmaVez('KeyX')) this.alternarModoCarro();

        const freioMaoAtivo = Entrada.tecla('Space') || TouchHUD.controls.drift;
        if (freioMaoAtivo && !this.freioMaoPressionadoAnterior) {
            const agora = performance.now() / 1000;
            this.historicoFreioMao.push(agora);
            this.historicoFreioMao = this.historicoFreioMao.filter((t) => agora - t <= 5.0);
            if (this.historicoFreioMao.length >= 10) {
                this.historicoFreioMao = [];
                this.alternarModoCarro();
            }
        }
        this.freioMaoPressionadoAnterior = freioMaoAtivo;

        if (Entrada.teclaUmaVez('KeyQ')) {
            this.wireframe = !this.wireframe;
            this.matOpaco.wireframe = this.wireframe;
            this.matRastro.wireframe = this.wireframe;
        }
        if (Entrada.teclaUmaVez('KeyR')) this.regenerarPista(true, true);

        let throttle = 0, steer = 0;
        let handbrake = freioMaoAtivo;

        if (this.config.pilotoAutomaticoOn) {
            const cmd = this.pilotoAuto.atualizar(this.veiculo, this.estrada);
            throttle = cmd.throttle; steer = cmd.steer; handbrake = cmd.handbrake;
        } else {
            if (Entrada.tecla('KeyW') || TouchHUD.controls.forward) throttle += 1;
            if (Entrada.tecla('KeyS') || TouchHUD.controls.backward) throttle -= 1;
            if (Entrada.tecla('KeyA') || TouchHUD.controls.left) steer += 1;
            if (Entrada.tecla('KeyD') || TouchHUD.controls.right) steer -= 1;
        }

        const shiftAgora = Entrada.tecla('ShiftLeft') || Entrada.tecla('ShiftRight') || TouchHUD.controls.jump;
        if (shiftAgora && !this.shiftAnterior && !this.painel.isMouseSobreUI()) this.carregandoPulo = true;
        if (!shiftAgora) this.carregandoPulo = false;
        this.shiftAnterior = shiftAgora;
        this.veiculo.setSegurandoPulo(this.carregandoPulo);

        const thisTime = performance.now() / 1000;
        let deltaTime = thisTime - this.lastTime;
        this.lastTime = thisTime;
        deltaTime = Math.min(deltaTime, 0.05);

        this.veiculo.update(deltaTime, throttle, steer, handbrake, this.alturaSuperficie);
        this.rastroPneus.update(deltaTime);

        if (this.veiculo.estaDerrapando()) {
            const intensidade = this.veiculo.getIntensidadeDrift();
            this.rastroPneus.adicionarPontoRoda(0, this.veiculo.getPosContatoRoda(2), this.veiculo.getEixoLateralRoda(2), intensidade, this.estavaDerrapandoAnterior);
            this.rastroPneus.adicionarPontoRoda(1, this.veiculo.getPosContatoRoda(3), this.veiculo.getEixoLateralRoda(3), intensidade, this.estavaDerrapandoAnterior);
            this.estavaDerrapandoAnterior = true;
        } else {
            this.estavaDerrapandoAnterior = false;
        }

        this.particulas.update(deltaTime);
        if (this.veiculo.estaDerrapando()) {
            const intensidade = this.veiculo.getIntensidadeDrift();
            for (let r = 2; r < 4; ++r) {
                const posRoda = this.veiculo.getPosContatoRoda(r);
                if (this.estrada.estaNoAsfalto(posRoda.x, posRoda.z)) {
                    const qtd = Math.max(1, Math.trunc(intensidade * 8));
                    this.particulas.emitirFumaca(posRoda, this.veiculo.getVelocidadeVetor(), deltaTime, qtd);
                }
            }
        }

        const velCarro = this.veiculo.getVelocidade();
        if (velCarro > 3.0 && !this.veiculo.estaNoAr()) {
            const chance = Math.trunc(((velCarro - 3.0) / 4.0) * 5.0 + 0.1);
            for (let r = 0; r < 4; ++r) {
                const posRoda = this.veiculo.getPosContatoRoda(r);
                if (!this.estrada.estaNoAsfalto(posRoda.x, posRoda.z)) {
                    if ((randGlobal.next() % 100) < chance)
                        this.particulas.emitirGrama(posRoda, this.veiculo.getVelocidadeVetor(), 1);
                }
            }
        }

        if (this.painel.update()) this.aplicarMudancasDoPainel();
        this.processarTrabalhoPendente();

        const mouseSobreUI = this.painel.isMouseSobreUI();
        const scroll = Entrada.consumirScroll();
        if (scroll !== 0) this.cam.processarScroll(scroll);

        this.cam.update(
            deltaTime,
            { x: Entrada.mouseX, y: Entrada.mouseY, direito: Entrada.direito, esquerdo: Entrada.esquerdo },
            this.veiculo.getPosicao(), this.veiculo.getYawAngle(), this.veiculo.getAlturaTeto(),
            throttle, this.veiculo.getVelocidade(), mouseSobreUI, this.alturaSuperficie
        );

        const cp = this.cam.cameraPos, ct = this.cam.cameraTarget, up = this.cam.getUpRef();
        this.renderizador.camera.position.set(cp.x, cp.y, cp.z);
        this.renderizador.camera.up.set(up.x, up.y, up.z);
        this.renderizador.camera.lookAt(ct.x, ct.y, ct.z);
        this.renderizador.camera.updateMatrixWorld(true);

        let targetOffX = 0, targetOffY = 0;
        if (TouchHUD.configMode) {
            if (w > h) targetOffX = -w * 0.3125;
            else targetOffY = -h * 0.25;
        }

        const dt60 = deltaTime * 60;
        const lerpCam = 1 - Math.pow(1 - 0.08, Math.min(dt60, 3.0));
        this.camOffsetX += (targetOffX - this.camOffsetX) * lerpCam;
        this.camOffsetY += (targetOffY - this.camOffsetY) * lerpCam;

        if (Math.abs(this.camOffsetX) > 1 || Math.abs(this.camOffsetY) > 1) {
            this.renderizador.camera.setViewOffset(w, h, this.camOffsetX, this.camOffsetY, w, h);
        } else {
            this.renderizador.camera.clearViewOffset();
        }
        this.renderizador.camera.updateProjectionMatrix();

        atualizarLuz(this.uniforms);
        const l = this.config.luz.parametros;
        const lightDir = new THREE.Vector3(l.dirX, l.dirY, l.dirZ);

        this.aplicarMatriz(this.chassiMesh, this.veiculo.matrizChassi());
        this.veiculo.matrizesRodas().forEach((m, i) => this.aplicarMatriz(this.rodasMesh[i], m));

        this.renderizarSombra(lightDir, this.veiculo.getPosicao());

        this.atualizarFloresta(this.renderizador.camera.position, false);
        const nG = this.grama.selecionar(this.renderizador.camera.position, false, this.gramaLote);
        this.gramaAttr.needsUpdate = true;
        this.gramaMesh.count = nG;

        const e = this.renderizador.camera.matrixWorld.elements;
        this.atualizarDinamicos(new THREE.Vector3(e[0], e[1], e[2]), new THREE.Vector3(e[4], e[5], e[6]));

        this.renderizador.renderer.setRenderTarget(null);
        this.renderizador.render();
        this.painel.render();
        this.atualizarHud(thisTime);

        if (this.trabalhoPesadoNoFrame) this.lastTime = performance.now() / 1000 - 1 / 60;
    };

    private atualizarHud(agora: number) {
        this.fps.n++;
        if (agora - this.fps.t >= 0.5) {
            this.fps.v = this.fps.n / (agora - this.fps.t);
            this.fps.n = 0; this.fps.t = agora;
        }
        this.hud.textContent =
            `Q: wireframe  R: nova pista  SHIFT: agachar/pular  ESPAÇO: freio de mão\n` +
            `botão direito: câmara  roda: zoom  X: alternar carro (${this.modoCarroGLB ? 'GLB' : 'Vermelho'})\n` +
            `seed ${this.seedPista}  ${this.fps.v.toFixed(0)} fps`;
    }

    dispose() {
        if (this.descartado) return;
        this.descartado = true;
        this.rodando = false;
        cancelAnimationFrame(this.rafId);
        this.removerDragAndDrop();
        Entrada.parar();
        TouchHUD.parar();
        this.painel.dispose();
        this.hud.remove();

        this.renderizador.scene.traverse((o: any) => {
            if (o.geometry) o.geometry.dispose();
        });

        this.matOpaco.dispose();
        this.matRastro.dispose();
        this.matParticula.dispose();
        this.renderizador.dispose();
    }
}