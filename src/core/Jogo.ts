// Jogo.ts - motor do jogo
import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { Veiculo, type Malha } from '@/entities/Veiculo';
import { CameraJogo } from '@/entities/Camera';
import { PilotoAutomatico } from '@/entities/PilotoAutomatico';
import { Entrada } from './Input';
import { type ControlesToque, criarControlesToque } from './ControlesToque';
import { Mat4 } from '@/graphics/Mat4';
import { Renderer } from '@/graphics/Renderer';
import { WorldBuilder } from '@/world/WorldBuilder';
import { RastroPneu } from '@/graphics/RastroPneu';
import { SistemaParticulas } from '@/graphics/Particulas';
import { randGlobal, sementeAleatoria } from '@/core/Random';
import {
    criarUniformsCompartilhados,
    criarMaterialPrincipal,
    criarMaterialRastro,
    criarMaterialParticula,
    atualizarLuz,
} from '@/graphics/materialPrincipal';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function geometriaDe(m: Malha): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return g;
}

const mudou = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

const CONFIG_CARRO_PADRAO = {
    dimensoes: { largura: 10.0, comprimento: 20.0, alturachao: 2.0, alturaporta: 4.5, alturaparabrisa: 4.5, comprimentorodas: 13.0, largurarodas: 10.0, offsetchassi: 0.0, taxaBaseCockpitTras: 0.1, taxaTopoCockpitTras: 0.2, taxaTopoCockpitFrente: 0.6, taxaBaseCockpitFrente: 0.7 },
    rodas: { raio: 2.0, largura: 1.5, segmentos: 16 },
    fisica: { aceleracao: 0.03, aceleracaoFreio: 0.04, velmax: 7.0, velmaxre: -2.0, anguloVolanteMax: 0.7, velocidadeGiro: 0.03, taxaLerpVolante: 0.035, aderenciaFreioDeMao: 0.015, aderenciaPista: 0.03, atritoEscalar: 0.9999, atritoLinear: 0.001, arrastoQuadratico: 0.0, suspensaoRigidez: 150.0, suspensaoAmortecimento: 8.0, suspensaoInclinacaoMax: 8.0, velReferenciaGiro: 0.5, taxaRecuperacaoGrip: 0.02, forcaPulo: 70.0, gravidade: 150.0, fatorPuloMinimo: 0.55, tempoCargaPulo: 0.6, compressaoPulo: 1.4, reacaoPouso: 1.0, limiarDecolagem: 10.0, limiarDriftRastro: 0.9 }
};

const CONFIG_CARRO_GLB = {
    dimensoes: { largura: 10.0, comprimento: 40.0, alturachao: 2.0, alturaporta: 4.5, alturaparabrisa: 4.5, comprimentorodas: 26.5, largurarodas: 15.9, offsetchassi: 0.100, taxaBaseCockpitTras: 0.1, taxaTopoCockpitTras: 0.2, taxaTopoCockpitFrente: 0.6, taxaBaseCockpitFrente: 0.7 },
    rodas: { raio: 3.2, largura: 1.5, segmentos: 16 },
    fisica: { aceleracao: 0.03, aceleracaoFreio: 0.04, velmax: 7.0, velmaxre: -2.0, anguloVolanteMax: 0.7, velocidadeGiro: 0.03, taxaLerpVolante: 0.035, aderenciaFreioDeMao: 0.015, aderenciaPista: 0.03, atritoEscalar: 0.9999, atritoLinear: 0.001, arrastoQuadratico: 0.0, suspensaoRigidez: 80.0, suspensaoAmortecimento: 8.0, suspensaoInclinacaoMax: 8.0, velReferenciaGiro: 0.5, taxaRecuperacaoGrip: 0.02, forcaPulo: 70.0, gravidade: 150.0, fatorPuloMinimo: 0.55, tempoCargaPulo: 0.6, compressaoPulo: 1.4, reacaoPouso: 1.0, limiarDecolagem: 10.0, limiarDriftRastro: 0.9 }
};

export interface JogoStats {
    fps: number;
    seed: number;
    modoCarroGLB: boolean;
}

export interface JogoOpcoes {
    controlesToque?: ControlesToque;
    onStats?: (stats: JogoStats) => void;
    onConfigRecarregada?: () => void;
}

export class Jogo {
    readonly config = GAME_CONFIG;
    private configAnterior: any = JSON.parse(JSON.stringify(GAME_CONFIG));

    private renderizador: Renderer;
    private world: WorldBuilder;
    private uniforms = criarUniformsCompartilhados();

    private veiculo = new Veiculo();
    private pilotoAuto = new PilotoAutomatico();
    private cam = new CameraJogo();

    private matOpaco = criarMaterialPrincipal(this.uniforms);
    private matRastro = criarMaterialRastro(this.uniforms);
    private matParticula = criarMaterialParticula();
    private rastroPneus = new RastroPneu(GAME_CONFIG.carro.rodas.largura, 8.0);
    private particulas = new SistemaParticulas();

    private chassiMesh!: THREE.Group;
    private modeloCarroAtual: THREE.Object3D | null = null;
    private bboxOriginalCarro = new THREE.Box3();

    private rodasMesh: THREE.Mesh[] = [];
    private malhaChassiProcedural: THREE.Mesh | null = null;

    private rodasGLBGroup = new THREE.Group();
    private rodasGLB: (THREE.Group | null)[] = [null, null, null, null];
    private raiosOriginaisGLB: number[] = [];

    private rastroMesh!: THREE.Mesh;
    private rastroBuf = { pos: new Float32Array(0), cor: new Float32Array(0) };
    private particulasMesh!: THREE.Mesh;
    private particulasBuf = { pos: new Float32Array(0), cor: new Float32Array(0) };

    private wireframe = false;
    private estavaDerrapandoAnterior = false;
    private shiftAnterior = false;
    private carregandoPulo = false;
    private terrenoDefasado = false;
    private vegetacaoPendente = false;
    private trabalhoPesadoNoFrame = false;
    private proximaRegenTerreno = 0;
    private lastTime = 0;
    private rafId = 0;
    private rodando = false;
    private descartado = false;

    private readonly controlesToque: ControlesToque;
    private readonly opcoes: JogoOpcoes;
    private configAberto = false;
    private mouseSobreUI = false;
    private painelAlterado = false;

    private fps = { t: 0, n: 0, v: 0 };
    private camOffsetX = 0;
    private camOffsetY = 0;

    private modoCarroGLB = false;
    private modeloGLBCache: THREE.Group | null = null;
    private estadoCarroVermelho = JSON.parse(JSON.stringify(CONFIG_CARRO_PADRAO));
    private estadoCarroGLB = JSON.parse(JSON.stringify(CONFIG_CARRO_GLB));
    private historicoFreioMao: number[] = [];
    private freioMaoPressionadoAnterior = false;

    constructor(private canvas: HTMLCanvasElement, opcoes: JogoOpcoes = {}) {
        this.opcoes = opcoes;
        this.controlesToque = opcoes.controlesToque ?? criarControlesToque();
        this.renderizador = new Renderer(canvas, this.uniforms);
        this.world = new WorldBuilder(this.uniforms, this.config);
        Entrada.iniciar(canvas);
    }

    setConfigAberto(aberto: boolean) { this.configAberto = aberto; }
    setMouseSobreUI(sobre: boolean) { this.mouseSobreUI = sobre; }
    marcarConfigAlterada() { this.painelAlterado = true; }

    async iniciar(urlTerreno = './terreno.raw') {
        Object.assign(this.config.carro.dimensoes, this.estadoCarroVermelho.dimensoes);
        Object.assign(this.config.carro.rodas, this.estadoCarroVermelho.rodas);
        Object.assign(this.config.carro.fisica, this.estadoCarroVermelho.fisica);

        const terrenoCarregado = await this.world.carregarTerreno(urlTerreno);
        if (this.descartado || !terrenoCarregado) return;
        this.veiculo.init();

        this.renderizador.scene.add(this.world.terrenoMesh);
        this.renderizador.scene.add(this.world.gramaMesh);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < this.world.florestaMeshes[i].length; j++) {
                if (this.world.florestaMeshes[i][j]) this.renderizador.scene.add(this.world.florestaMeshes[i][j]);
            }
        }

        this.chassiMesh = new THREE.Group();
        this.chassiMesh.matrixAutoUpdate = false;
        this.chassiMesh.frustumCulled = false;
        this.renderizador.scene.add(this.chassiMesh);

        this.rodasGLBGroup.matrixAutoUpdate = false;
        this.renderizador.scene.add(this.rodasGLBGroup);

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
        loader.load('./carro.glb', (gltf) => {
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
        }, undefined, () => { console.log('carro.glb n o encontrado em /public.'); });

        this.rastroMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.matRastro);
        this.rastroMesh.frustumCulled = false;
        this.renderizador.scene.add(this.rastroMesh);

        this.particulasMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.matParticula);
        this.particulasMesh.frustumCulled = false;
        this.renderizador.scene.add(this.particulasMesh);

        const s = Number(new URLSearchParams(location.search).get('seed'));
        if (Number.isFinite(s) && s > 0) this.world.seedPista = s >>> 0;

        this.regenerarPista(this.world.seedPista === 0, true);
        this.configAnterior = JSON.parse(JSON.stringify(this.config));

        this.lastTime = performance.now() / 1000;
        this.rodando = true;
        this.rafId = requestAnimationFrame(this.loop);
    }

    private regenerarPista(novaSeed: boolean, reposicionar: boolean) {
        this.world.regenerarPista(novaSeed);
        if (this.world.estradaMesh && !this.renderizador.scene.children.includes(this.world.estradaMesh)) {
            this.renderizador.scene.add(this.world.estradaMesh);
        }

        this.veiculo.invalidarSolo();

        if (reposicionar) {
            const curva = this.world.estrada.getPontosCurva();
            if (curva.length >= 2) {
                const d = { x: curva[1].x - curva[0].x, y: curva[1].y - curva[0].y, z: curva[1].z - curva[0].z };
                const l = Math.hypot(d.x, d.y, d.z) || 1;
                this.veiculo.reposicionarNaPista(curva[0], { x: d.x / l, y: d.y / l, z: d.z / l });
            }
        }

        this.world.regerarVegetacao();
        this.terrenoDefasado = false;
        this.vegetacaoPendente = false;
        this.trabalhoPesadoNoFrame = true;
        this.emitirStats();
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
            if (this.modeloGLBCache) this.aplicarNovoModeloCarro(this.modeloGLBCache.clone());
        } else {
            this.modeloCarroAtual = null;

            while (this.rodasGLBGroup.children.length > 0) {
                this.rodasGLBGroup.remove(this.rodasGLBGroup.children[0]);
            }
            this.rodasGLB = [null, null, null, null];
            this.raiosOriginaisGLB = [];
            this.rodasMesh.forEach(m => m.visible = true);

            if (this.malhaChassiProcedural) {
                this.malhaChassiProcedural.geometry.dispose();
                this.malhaChassiProcedural.geometry = geometriaDe(this.veiculo.gerarMalhaChassi());
                this.chassiMesh.add(this.malhaChassiProcedural);
            }
        }

        this.configAnterior = JSON.parse(JSON.stringify(this.config));
        this.opcoes.onConfigRecarregada?.();
        this.emitirStats();
    }

    public aplicarNovoModeloCarro(modelo: THREE.Object3D) {
        while (this.chassiMesh.children.length > 0) {
            this.chassiMesh.remove(this.chassiMesh.children[0]);
        }
        while (this.rodasGLBGroup.children.length > 0) {
            this.rodasGLBGroup.remove(this.rodasGLBGroup.children[0]);
        }
        this.rodasGLB = [null, null, null, null];
        this.raiosOriginaisGLB = [];
        this.rodasMesh.forEach(m => m.visible = true);

        modelo.position.set(0, 0, 0);
        modelo.rotation.set(0, 0, 0);
        modelo.scale.set(1, 1, 1);
        modelo.updateMatrixWorld(true);

        const encontrarRoda = (nomeBuscado: string) => {
            let encontrada: THREE.Object3D | null = null;
            const buscaNormalizada = nomeBuscado.toLowerCase().replace(/[^a-z0-9]/g, '');
            modelo.traverse((child) => {
                if (!encontrada) {
                    const nomeNormalizado = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (nomeNormalizado.includes(buscaNormalizada)) {
                        encontrada = child;
                    }
                }
            });
            return encontrada;
        };

        const rFE = encontrarRoda('wheelfl');
        const rFD = encontrarRoda('wheelfr');
        const rTE = encontrarRoda('wheelrl');
        const rTD = encontrarRoda('wheelrr');

        if (rFE && rFD && rTE && rTD) {
            const extraidas = [rFE, rFD, rTE, rTD];
            this.rodasMesh.forEach(m => m.visible = false);

            // 1. EXTRAIR AS RODAS PRIMEIRO!
            extraidas.forEach((r, i) => {
                const wrapper = new THREE.Group();
                wrapper.matrixAutoUpdate = false;
                wrapper.add(r);

                wrapper.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(r);
                const size = new THREE.Vector3();
                box.getSize(size);

                const diametroOriginal = Math.max(size.x, size.y, size.z);
                this.raiosOriginaisGLB.push(diametroOriginal / 2);

                const centerWorld = new THREE.Vector3();
                box.getCenter(centerWorld);

                const centerLocal = r.worldToLocal(centerWorld.clone());

                if ((r as THREE.Mesh).isMesh && (r as THREE.Mesh).geometry) {
                    (r as THREE.Mesh).geometry.translate(-centerLocal.x, -centerLocal.y, -centerLocal.z);
                }
                const childrenToMove = [...r.children];
                for (const child of childrenToMove) {
                    child.position.sub(centerLocal);
                }

                // --- A CORRE O ESTÁ AQUI: TIREI A ROTAÇÃO MANUAL QUE ESTAVA A CONFLITUAR ---
                r.position.set(0, 0, 0);
                r.rotation.set(0, 0, 0);
                r.scale.set(1, 1, 1);

                this.rodasGLBGroup.add(wrapper);
                this.rodasGLB[i] = wrapper;
            });

            // 2. SÓ AGORA MEDIMOS A CAIXA DO CARRO
            modelo.updateMatrixWorld(true);
            this.bboxOriginalCarro = new THREE.Box3().setFromObject(modelo);

            this.modeloCarroAtual = modelo;
            this.atualizarTransformacaoModeloCarro();
        } else {
            this.bboxOriginalCarro = new THREE.Box3().setFromObject(modelo);
            this.modeloCarroAtual = modelo;
            this.atualizarTransformacaoModeloCarro();
        }

        modelo.matrixAutoUpdate = true;
        this.chassiMesh.add(modelo);
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

    public async carregarModeloGLBLocal(arquivo: File) {
        try {
            const buffer = await arquivo.arrayBuffer();
            const loader = new GLTFLoader();
            const gltf = await loader.parseAsync(buffer, '');

            this.modeloGLBCache = gltf.scene;

            if (!this.modoCarroGLB) {
                this.alternarModoCarro();
            } else {
                this.aplicarNovoModeloCarro(this.modeloGLBCache.clone());
            }
            console.log(`Modelo ${arquivo.name} importado com sucesso!`);
        } catch (err) {
            console.error('Falha ao processar o ficheiro .glb:', err);
            alert('Erro ao carregar o modelo .glb.');
        }
    }

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

        if (arvoreMudou) { this.world.construirFlorestaGeometrias(); this.vegetacaoPendente = true; }
        if (gramaMudou) {
            this.world.gramaMesh.geometry.dispose();
            this.world.gramaMesh.geometry = geometriaDe(gerarGeometriaTufo(this.config));
            this.vegetacaoPendente = true;
        }

        if (terrenoMudou) this.terrenoDefasado = true;
        this.configAnterior = JSON.parse(JSON.stringify(c));
    }

    private processarTrabalhoPendente() {
        const arrastando = Entrada.esquerdo;
        const agora = performance.now() / 1000;

        if (this.terrenoDefasado && (!arrastando || agora >= this.proximaRegenTerreno)) {
            const inicio = performance.now() / 1000;
            this.world.regenerarPista(false);
            this.veiculo.invalidarSolo();

            const fim = performance.now() / 1000;
            this.proximaRegenTerreno = fim + Math.max(0.15, (fim - inicio) * 3.0);

            this.terrenoDefasado = false; this.vegetacaoPendente = true; this.trabalhoPesadoNoFrame = true;
        }

        if (this.vegetacaoPendente && !arrastando) {
            this.world.regerarVegetacao();
            this.vegetacaoPendente = false; this.trabalhoPesadoNoFrame = true;
        }
    }

    private aplicarMatriz(obj: THREE.Object3D | undefined, m: Mat4) {
        if (!obj) return;
        obj.matrix.fromArray(m.m);
        obj.matrixWorldNeedsUpdate = true;
    }

    private renderizarSombra(lightDir: THREE.Vector3, p: { x: number; y: number; z: number }) {
        const alvo = new THREE.Vector3(p.x, p.y, p.z);
        this.renderizador.sombra.atualizarMatriz(lightDir, alvo);

        this.world.gramaMesh.visible = false;
        this.rastroMesh.visible = false;
        this.particulasMesh.visible = false;
        this.world.atualizarFlorestaLods(p, true);

        const r = this.renderizador.renderer;
        r.setRenderTarget(this.renderizador.sombra.alvo);
        r.clear(true, true, false);

        this.renderizador.scene.overrideMaterial = this.renderizador.sombra.materialProfundidade;
        this.renderizador.render();
        this.renderizador.scene.overrideMaterial = null;
        r.setRenderTarget(null);

        this.uniforms.uShadowOn.value = 1;
        this.world.gramaMesh.visible = true;
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

        const freioMaoAtivo = Entrada.tecla('Space') || this.controlesToque.drift;
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
            this.world.setWireframe(this.wireframe);
            this.matOpaco.wireframe = this.wireframe;
            this.matRastro.wireframe = this.wireframe;
        }
        if (Entrada.teclaUmaVez('KeyR')) this.regenerarPista(true, true);

        let throttle = 0, steer = 0;
        let handbrake = freioMaoAtivo;

        if (this.config.pilotoAutomaticoOn) {
            const cmd = this.pilotoAuto.atualizar(this.veiculo, this.world.estrada);
            throttle = cmd.throttle; steer = cmd.steer; handbrake = cmd.handbrake;
        } else {
            if (Entrada.tecla('KeyW') || this.controlesToque.forward) throttle += 1;
            if (Entrada.tecla('KeyS') || this.controlesToque.backward) throttle -= 1;
            if (Entrada.tecla('KeyA') || this.controlesToque.left) steer += 1;
            if (Entrada.tecla('KeyD') || this.controlesToque.right) steer -= 1;
        }

        const shiftAgora = Entrada.tecla('ShiftLeft') || Entrada.tecla('ShiftRight') || this.controlesToque.jump;
        if (shiftAgora && !this.shiftAnterior && !this.mouseSobreUI) this.carregandoPulo = true;
        if (!shiftAgora) this.carregandoPulo = false;
        this.shiftAnterior = shiftAgora;
        this.veiculo.setSegurandoPulo(this.carregandoPulo);

        const thisTime = performance.now() / 1000;
        let deltaTime = thisTime - this.lastTime;
        this.lastTime = thisTime;
        deltaTime = Math.min(deltaTime, 0.05);

        this.veiculo.update(deltaTime, throttle, steer, handbrake, this.world.alturaSuperficie);
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
                if (this.world.estrada.estaNoAsfalto(posRoda.x, posRoda.z)) {
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
                if (!this.world.estrada.estaNoAsfalto(posRoda.x, posRoda.z)) {
                    if ((randGlobal.next() % 100) < chance)
                        this.particulas.emitirGrama(posRoda, this.veiculo.getVelocidadeVetor(), 1);
                }
            }
        }

        if (this.painelAlterado) {
            this.painelAlterado = false;
            this.aplicarMudancasDoPainel();
        }

        this.processarTrabalhoPendente();

        const mouseSobreUI = this.mouseSobreUI;
        const scroll = Entrada.consumirScroll();
        if (scroll !== 0) this.cam.processarScroll(scroll);

        this.cam.update(
            deltaTime,
            { x: Entrada.mouseX, y: Entrada.mouseY, direito: Entrada.direito, esquerdo: Entrada.esquerdo },
            this.veiculo.getPosicao(), this.veiculo.getYawAngle(), this.veiculo.getAlturaTeto(),
            throttle, this.veiculo.getVelocidade(), mouseSobreUI, this.world.alturaSuperficie
        );

        const cp = this.cam.cameraPos, ct = this.cam.cameraTarget, up = this.cam.getUpRef();
        this.renderizador.camera.position.set(cp.x, cp.y, cp.z);
        this.renderizador.camera.up.set(up.x, up.y, up.z);
        this.renderizador.camera.lookAt(ct.x, ct.y, ct.z);
        this.renderizador.camera.updateMatrixWorld(true);

        let targetOffX = 0, targetOffY = 0;
        if (this.configAberto) {
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

        const matrizesRodas = this.veiculo.matrizesRodas();
        matrizesRodas.forEach((m, i) => {
            if (this.rodasGLB[i]) {
                const matThree = new THREE.Matrix4().fromArray(m.m);

                matThree.multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));

                const fatorEscala = this.config.carro.rodas.raio / Math.max(0.001, this.raiosOriginaisGLB[i]);
                matThree.scale(new THREE.Vector3(fatorEscala, fatorEscala, fatorEscala));

                const wrapper = this.rodasGLB[i]!;
                wrapper.matrix.copy(matThree);
                wrapper.matrixWorldNeedsUpdate = true;
            } else {
                this.aplicarMatriz(this.rodasMesh[i], m);
            }
        });

        this.renderizarSombra(lightDir, this.veiculo.getPosicao());
        this.world.atualizarFlorestaLods(this.renderizador.camera.position, false);

        const nG = this.world.grama.selecionar(this.renderizador.camera.position, false, this.world.gramaLote);
        this.world.atualizarGrama();
        this.world.gramaMesh.count = nG;

        const e = this.renderizador.camera.matrixWorld.elements;
        this.atualizarDinamicos(new THREE.Vector3(e[0], e[1], e[2]), new THREE.Vector3(e[4], e[5], e[6]));

        this.renderizador.renderer.setRenderTarget(null);
        this.renderizador.render();
        this.atualizarHud(thisTime);

        if (this.trabalhoPesadoNoFrame) this.lastTime = performance.now() / 1000 - 1 / 60;
    };

    private atualizarHud(agora: number) {
        this.fps.n++;
        if (agora - this.fps.t >= 0.5) {
            this.fps.v = this.fps.n / (agora - this.fps.t);
            this.fps.n = 0; this.fps.t = agora;
            this.emitirStats();
        }
    }

    private emitirStats() {
        this.opcoes.onStats?.({
            fps: this.fps.v,
            seed: this.world.seedPista,
            modoCarroGLB: this.modoCarroGLB,
        });
    }

    dispose() {
        if (this.descartado) return;
        this.descartado = true;
        this.rodando = false;
        cancelAnimationFrame(this.rafId);
        Entrada.parar();

        this.renderizador.scene.traverse((o: any) => {
            if (o.geometry) o.geometry.dispose();
        });

        this.world.dispose();
        this.matOpaco.dispose();
        this.matRastro.dispose();
        this.matParticula.dispose();
        this.renderizador.dispose();
    }
}