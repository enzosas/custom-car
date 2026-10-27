// Jogo.ts — motor do jogo: port de main.cpp (mainLoop, regenerarPista, aplicarMudancasDoPainel...).
// Cria a cena three.js, roda a física/lógica pura (Veiculo, Estrada, ...) e faz os dois passes de render.

import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { Terreno } from './Terreno';
import { Estrada } from './Estrada';
import { Veiculo, type Malha } from './Veiculo';
import { CameraJogo } from './Camera';
import { Floresta } from './Floresta';
import { Grama, gerarGeometriaTufo } from './Grama';
import { gerarGeometriasArvore } from './Arvore';
import { RastroPneu } from './RastroPneu';
import { SistemaParticulas } from './Particulas';
import { PilotoAutomatico } from './PilotoAutomatico';
import { PainelConfig } from './PainelConfig';
import { ShadowMap } from './ShadowMap';
import { Entrada } from './Input';
import { Mat4 } from './Mat4';
import { randGlobal, sementeAleatoria } from './Random';
import {
    criarUniformsCompartilhados, criarMaterialPrincipal, criarMaterialRastro, criarMaterialParticula, atualizarLuz,
} from './materialPrincipal';

const NEAR_PLANE = 0.3;
const FAR_PLANE = 15000;
const COR_GRAMA = [0.34, 0.7, 0.56];

function geometriaDe(m: Malha): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return g;
}

const mudou = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

export class Jogo {
    readonly config = GAME_CONFIG;
    private configAnterior: any = JSON.parse(JSON.stringify(GAME_CONFIG));

    // three
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(60, 1, NEAR_PLANE, FAR_PLANE);
    private uniforms = criarUniformsCompartilhados();
    private matOpaco = criarMaterialPrincipal(this.uniforms);
    private matRastro = criarMaterialRastro(this.uniforms);
    private matParticula = criarMaterialParticula();
    private sombra: ShadowMap;

    // subsistemas
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

    // malhas
    private terrenoMesh!: THREE.Mesh;
    private terrenoPos!: THREE.BufferAttribute;
    private estradaMesh: THREE.Mesh | null = null;
    private chassiMesh!: THREE.Mesh;
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

    // estado do main.cpp
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
    private fps = { t: 0, n: 0, v: 0 };

    constructor(private canvas: HTMLCanvasElement, private hostUI: HTMLElement) {
        // glClearColor(0.8, 0.85, 0.9): valor cru na tela (setRGB em sRGB evita a conversão de saída)
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(new THREE.Color().setRGB(0.8, 0.85, 0.9, THREE.SRGBColorSpace), 1);
        this.scene.matrixWorldAutoUpdate = true;

        this.sombra = new ShadowMap(this.uniforms);
        this.painel = new PainelConfig(hostUI, this.config);

        this.hud = document.createElement('div');
        Object.assign(this.hud.style, {
            position: 'absolute', right: '10px', top: '8px', color: '#000', font: '12px/1.5 monospace',
            textAlign: 'right', pointerEvents: 'none', whiteSpace: 'pre', userSelect: 'none',
        } as CSSStyleDeclaration);
        hostUI.appendChild(this.hud);

        Entrada.iniciar(canvas);
        this.redimensionar();
        window.addEventListener('resize', this.redimensionar);
    }

    // ------------------------------------------------------------------ inicialização
    async iniciar(urlTerreno = '/terreno.raw') {
        const resp = await fetch(urlTerreno);
        if (this.descartado) return;
        if (!resp.ok) throw new Error(`${urlTerreno} não encontrado (coloque terreno.raw em /public)`);
        const buffer = await resp.arrayBuffer();
        if (this.descartado) return; // o React (StrictMode) pode ter descartado esta instância durante o fetch
        this.terreno.carregarRaw(buffer);

        this.veiculo.init();

        // terreno
        const pos = this.terreno.gerarPosicoes();
        const cores = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) { cores[i] = COR_GRAMA[0]; cores[i + 1] = COR_GRAMA[1]; cores[i + 2] = COR_GRAMA[2]; }
        const gt = new THREE.BufferGeometry();
        this.terrenoPos = new THREE.BufferAttribute(pos, 3);
        this.terrenoPos.setUsage(THREE.DynamicDrawUsage);
        gt.setAttribute('position', this.terrenoPos);
        gt.setAttribute('color', new THREE.BufferAttribute(cores, 3));
        gt.setIndex(new THREE.BufferAttribute(this.terreno.gerarIndices(), 1));
        this.terrenoMesh = new THREE.Mesh(gt, this.matOpaco);
        this.terrenoMesh.frustumCulled = false;
        this.scene.add(this.terrenoMesh);

        // veículo
        this.chassiMesh = new THREE.Mesh(geometriaDe(this.veiculo.gerarMalhaChassi()), this.matOpaco);
        const geoRoda = geometriaDe(this.veiculo.gerarMalhaRoda());
        for (let i = 0; i < 4; ++i) {
            const m = new THREE.Mesh(geoRoda, this.matOpaco);
            m.frustumCulled = false; m.matrixAutoUpdate = false;
            this.rodasMesh.push(m); this.scene.add(m);
        }
        this.chassiMesh.frustumCulled = false; this.chassiMesh.matrixAutoUpdate = false;
        this.scene.add(this.chassiMesh);

        // vegetação instanciada
        this.construirFlorestaGeometrias();
        this.gramaMesh = new THREE.InstancedMesh(geometriaDe(gerarGeometriaTufo(this.config)), this.matOpaco, 1);
        this.gramaMesh.frustumCulled = false; this.gramaMesh.count = 0;
        this.scene.add(this.gramaMesh);

        // rastros e partículas (buffers dinâmicos)
        const gr = new THREE.BufferGeometry();
        this.rastroMesh = new THREE.Mesh(gr, this.matRastro);
        this.rastroMesh.frustumCulled = false;
        this.scene.add(this.rastroMesh);

        const gp = new THREE.BufferGeometry();
        this.particulasMesh = new THREE.Mesh(gp, this.matParticula);
        this.particulasMesh.frustumCulled = false;
        this.scene.add(this.particulasMesh);

        // primeira pista (seed opcional na URL: ?seed=123)
        const s = Number(new URLSearchParams(location.search).get('seed'));
        if (Number.isFinite(s) && s > 0) this.seedPista = s >>> 0;
        this.regenerarPista(this.seedPista === 0, true);
        this.configAnterior = JSON.parse(JSON.stringify(this.config));

        console.log('Q: alternar wireframe\nR: nova pista\nSHIFT: segure para agachar e solte para pular');

        this.lastTime = performance.now() / 1000;
        this.rodando = true;
        this.rafId = requestAnimationFrame(this.loop);
    }

    // ------------------------------------------------------------------ floresta / grama
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
                    this.scene.add(mesh);
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
        this.florestaLotes = [];
        this.florestaAttrs = [];
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

    // ------------------------------------------------------------------ pista / terreno
    private atualizarMalhaTerreno() {
        (this.terrenoPos.array as Float32Array).set(this.terreno.gerarPosicoes());
        this.terrenoPos.needsUpdate = true;
    }

    private atualizarMalhaEstrada(m: { positions: Float32Array; colors: Float32Array; indices: Uint32Array } | null) {
        if (this.estradaMesh) {
            this.scene.remove(this.estradaMesh);
            this.estradaMesh.geometry.dispose();
            this.estradaMesh = null;
        }
        if (!m) return;
        this.estradaMesh = new THREE.Mesh(geometriaDe(m), this.matOpaco);
        this.estradaMesh.frustumCulled = false;
        this.scene.add(this.estradaMesh);
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
            this.chassiMesh.geometry.dispose();
            this.chassiMesh.geometry = geometriaDe(this.veiculo.gerarMalhaChassi());
            const geoRoda = geometriaDe(this.veiculo.gerarMalhaRoda());
            this.rodasMesh[0].geometry.dispose();
            this.rodasMesh.forEach((m) => { m.geometry = geoRoda; });
            this.rastroPneus.setLargura(c.carro.rodas.largura);
        }
        if (arvoreMudou) { this.construirFlorestaGeometrias(); this.vegetacaoPendente = true; }
        if (gramaMudou) {
            this.gramaMesh.geometry.dispose();
            this.gramaMesh.geometry = geometriaDe(gerarGeometriaTufo(this.config));
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
            this.gerarEstrada();
            this.veiculo.invalidarSolo();
            const fim = performance.now() / 1000;
            this.proximaRegenTerreno = fim + Math.max(0.15, (fim - inicio) * 3.0);
            this.terrenoDefasado = false;
            this.vegetacaoPendente = true;
            this.trabalhoPesadoNoFrame = true;
        }
        if (this.vegetacaoPendente && !arrastando) {
            this.regerarVegetacao();
            this.vegetacaoPendente = false;
            this.trabalhoPesadoNoFrame = true;
        }
    }

    // ------------------------------------------------------------------ render
    private redimensionar = () => {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
    };

    private aplicarMatriz(obj: THREE.Object3D, m: Mat4) {
        obj.matrix.fromArray(m.m);
        obj.matrixWorldNeedsUpdate = true;
    }

    private atualizarFloresta(ref: { x: number; y: number; z: number }, sombraPass: boolean) {
        const cont = this.floresta.selecionar(ref, sombraPass, this.florestaLotes);
        for (let k = 0; k < 4; ++k) {
            this.florestaAttrs[k].needsUpdate = true;
            for (const mesh of this.florestaMeshes[k]) { mesh.count = cont[k]; mesh.visible = cont[k] > 0; }
        }
    }

    private renderizarSombra(lightDir: THREE.Vector3, p: { x: number; y: number; z: number }) {
        const alvo = new THREE.Vector3(p.x, p.y, p.z);
        this.sombra.atualizarMatriz(lightDir, alvo);

        // só terreno, estrada, veículo e floresta entram no mapa de sombras
        this.gramaMesh.visible = false; this.rastroMesh.visible = false; this.particulasMesh.visible = false;
        this.atualizarFloresta(p, true);

        const r = this.renderer;
        r.setRenderTarget(this.sombra.alvo);
        r.clear(true, true, false);
        this.scene.overrideMaterial = this.sombra.materialProfundidade;
        r.render(this.scene, this.camera);
        this.scene.overrideMaterial = null;
        r.setRenderTarget(null);

        this.uniforms.uShadowOn.value = 1;
        this.gramaMesh.visible = true; this.rastroMesh.visible = true; this.particulasMesh.visible = true;
    }

    private atualizarDinamicos(camRight: THREE.Vector3, camUp: THREE.Vector3) {
        // rastros
        const nR = this.rastroPneus.gerarGeometria(this.rastroBuf);
        this.sincronizarBuffer(this.rastroMesh.geometry, 'position', this.rastroBuf.pos, 3, nR);
        this.sincronizarBuffer(this.rastroMesh.geometry, 'color', this.rastroBuf.cor, 3, nR);
        this.rastroMesh.geometry.setDrawRange(0, nR);
        this.rastroMesh.visible = nR > 0;

        // partículas
        const nP = this.particulas.gerarGeometria(
            { x: camRight.x, y: camRight.y, z: camRight.z }, { x: camUp.x, y: camUp.y, z: camUp.z }, this.particulasBuf);
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

    // ------------------------------------------------------------------ loop principal
    private loop = () => {
        if (!this.rodando) return;
        this.rafId = requestAnimationFrame(this.loop);
        this.trabalhoPesadoNoFrame = false;

        const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
        if (w === 0 || h === 0) return;

        if (Entrada.teclaUmaVez('KeyQ')) {
            this.wireframe = !this.wireframe;
            this.matOpaco.wireframe = this.wireframe;
            this.matRastro.wireframe = this.wireframe;
        }
        if (Entrada.teclaUmaVez('KeyR')) this.regenerarPista(true, true);

        // comandos
        let throttle = 0, steer = 0;
        let handbrake = Entrada.tecla('Space');
        if (this.config.pilotoAutomaticoOn) {
            const cmd = this.pilotoAuto.atualizar(this.veiculo, this.estrada);
            throttle = cmd.throttle; steer = cmd.steer; handbrake = cmd.handbrake;
        } else {
            if (Entrada.tecla('KeyW')) throttle += 1;
            if (Entrada.tecla('KeyS')) throttle -= 1;
            if (Entrada.tecla('KeyA')) steer += 1;
            if (Entrada.tecla('KeyD')) steer -= 1;
        }

        // pulo com shift: segura para agachar, solta para pular
        const shiftAgora = Entrada.tecla('ShiftLeft') || Entrada.tecla('ShiftRight');
        if (shiftAgora && !this.shiftAnterior && !this.painel.isMouseSobreUI()) this.carregandoPulo = true;
        if (!shiftAgora) this.carregandoPulo = false;
        this.shiftAnterior = shiftAgora;
        this.veiculo.setSegurandoPulo(this.carregandoPulo);

        // delta time
        const thisTime = performance.now() / 1000;
        let deltaTime = thisTime - this.lastTime;
        this.lastTime = thisTime;
        deltaTime = Math.min(deltaTime, 0.05);

        this.veiculo.update(deltaTime, throttle, steer, handbrake, this.alturaSuperficie);

        // rastros
        this.rastroPneus.update(deltaTime);
        if (this.veiculo.estaDerrapando()) {
            const intensidade = this.veiculo.getIntensidadeDrift();
            this.rastroPneus.adicionarPontoRoda(0, this.veiculo.getPosContatoRoda(2), this.veiculo.getEixoLateralRoda(2), intensidade, this.estavaDerrapandoAnterior);
            this.rastroPneus.adicionarPontoRoda(1, this.veiculo.getPosContatoRoda(3), this.veiculo.getEixoLateralRoda(3), intensidade, this.estavaDerrapandoAnterior);
            this.estavaDerrapandoAnterior = true;
        } else {
            this.estavaDerrapandoAnterior = false;
        }

        // partículas
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
                    if ((randGlobal.next() % 100) < chance) this.particulas.emitirGrama(posRoda, this.veiculo.getVelocidadeVetor(), 1);
                }
            }
        }

        // painel
        if (this.painel.update()) this.aplicarMudancasDoPainel();
        this.processarTrabalhoPendente();

        // câmera
        const mouseSobreUI = this.painel.isMouseSobreUI();
        const scroll = Entrada.consumirScroll();
        if (scroll !== 0) this.cam.processarScroll(scroll);
        this.cam.update(deltaTime,
            { x: Entrada.mouseX, y: Entrada.mouseY, direito: Entrada.direito, esquerdo: Entrada.esquerdo },
            this.veiculo.getPosicao(), this.veiculo.getYawAngle(), this.veiculo.getAlturaTeto(),
            throttle, this.veiculo.getVelocidade(), mouseSobreUI, this.alturaSuperficie);

        const cp = this.cam.cameraPos, ct = this.cam.cameraTarget, up = this.cam.getUpRef();
        this.camera.position.set(cp.x, cp.y, cp.z);
        this.camera.up.set(up.x, up.y, up.z);
        this.camera.lookAt(ct.x, ct.y, ct.z);
        this.camera.updateMatrixWorld(true);
        this.camera.updateProjectionMatrix();

        // luz
        atualizarLuz(this.uniforms);
        const l = this.config.luz.parametros;
        const lightDir = new THREE.Vector3(l.dirX, l.dirY, l.dirZ);

        // matrizes do veículo
        this.aplicarMatriz(this.chassiMesh, this.veiculo.matrizChassi());
        this.veiculo.matrizesRodas().forEach((m, i) => this.aplicarMatriz(this.rodasMesh[i], m));

        // passe de sombra (tudo que não é grama/rastro/partículas)
        this.renderizarSombra(lightDir, this.veiculo.getPosicao());

        // passe principal
        this.atualizarFloresta(this.camera.position, false);
        const nG = this.grama.selecionar(this.camera.position, false, this.gramaLote);
        this.gramaAttr.needsUpdate = true;
        this.gramaMesh.count = nG;

        const e = this.camera.matrixWorld.elements;
        this.atualizarDinamicos(new THREE.Vector3(e[0], e[1], e[2]), new THREE.Vector3(e[4], e[5], e[6]));

        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);

        this.painel.render();
        this.atualizarHud(thisTime);

        if (this.trabalhoPesadoNoFrame) this.lastTime = performance.now() / 1000 - 1 / 60;
    };

    private atualizarHud(agora: number) {
        this.fps.n++;
        if (agora - this.fps.t >= 0.5) { this.fps.v = this.fps.n / (agora - this.fps.t); this.fps.n = 0; this.fps.t = agora; }
        this.hud.textContent =
            `Q: wireframe  R: nova pista  SHIFT: agachar/pular  ESPAÇO: freio de mão\n` +
            `botão direito: câmera  roda: zoom\nseed ${this.seedPista}  ${this.fps.v.toFixed(0)} fps`;
    }

    dispose() {
        if (this.descartado) return;
        this.descartado = true;
        this.rodando = false;
        cancelAnimationFrame(this.rafId);
        window.removeEventListener('resize', this.redimensionar);
        Entrada.parar();
        this.painel.dispose();
        this.hud.remove();
        this.sombra.dispose();
        this.scene.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); });
        this.matOpaco.dispose(); this.matRastro.dispose(); this.matParticula.dispose();
        this.renderer.dispose();
    }
}
