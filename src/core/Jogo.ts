// Jogo.ts - motor do jogo
import * as THREE from 'three';
import { GAME_CONFIG, PERFIL_CARRO_VERMELHO, PERFIL_CARRO_GLB, type PerfilCarro } from './config';
import { Veiculo } from '@/entities/Veiculo';
import { CameraJogo } from '@/entities/Camera';
import { Entrada } from './Input';
import { type ControlesToque, criarControlesToque } from './ControlesToque';
import { ControleJogador } from './ControleJogador';
import { CarroVisual } from '@/entities/CarroVisual';
import { EfeitosDrift } from '@/entities/EfeitosDrift';
import { lerpFactorDt } from '@/graphics/Mat4';
import { sementeAleatoria } from './Random';
import { geometriaDe } from '@/graphics/Malha';
import { Renderer } from '@/graphics/Renderer';
import { WorldBuilder } from '@/world/WorldBuilder';
import { gerarGeometriaTufo } from '@/world/Grama';
import {
    criarUniformsCompartilhados,
    criarMaterialPrincipal,
    atualizarLuz,
} from '@/graphics/materialPrincipal';

const mudou = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/**
 * O mapa de sombras é redesenhado a cada N frames (1 = todo frame).
 * ATENÇÃO: com N > 1 a sombra do carro fica atrasada em alguns frames e aparece "dobrada"/tremida enquanto ele
 * anda. Deixe em 1 a menos que o carro não projete sombra ou que o desempenho exija.
 */
const INTERVALO_SOMBRA = 1;

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
    private configAnterior: typeof GAME_CONFIG = structuredClone(GAME_CONFIG);

    private renderizador: Renderer;
    private world: WorldBuilder;
    private uniforms = criarUniformsCompartilhados();

    private veiculo = new Veiculo();
    private cam = new CameraJogo();

    private matOpaco = criarMaterialPrincipal(this.uniforms);

    private carro!: CarroVisual;
    private efeitos!: EfeitosDrift;
    private readonly controle: ControleJogador;

    private wireframe = false;
    private terrenoDefasado = false;
    private vegetacaoPendente = false;
    private trabalhoPesadoNoFrame = false;
    private proximaRegenTerreno = 0;
    private quadroSombra = 0;
    private forcarSombra = true;
    private readonly lightDirTmp = new THREE.Vector3();
    private readonly alvoSombraTmp = new THREE.Vector3();
    private lastTime = 0;
    private rafId = 0;
    private rodando = false;
    private descartado = false;

    private readonly opcoes: JogoOpcoes;
    private configAberto = false;
    private mouseSobreUI = false;
    private painelAlterado = false;

    private fps = { t: 0, n: 0, v: 0 };
    private camOffsetX = 0;
    private camOffsetY = 0;

    private modoCarroGLB = false;
    private estadoCarroVermelho: PerfilCarro = structuredClone(PERFIL_CARRO_VERMELHO);
    private estadoCarroGLB: PerfilCarro = structuredClone(PERFIL_CARRO_GLB);

    constructor(canvas: HTMLCanvasElement, opcoes: JogoOpcoes = {}) {
        this.opcoes = opcoes;
        this.controle = new ControleJogador(opcoes.controlesToque ?? criarControlesToque());
        this.renderizador = new Renderer(canvas, this.uniforms);
        this.world = new WorldBuilder(this.matOpaco, this.config);
        Entrada.iniciar(canvas);
    }

    /** copia um perfil de carro (dimensões, rodas, física) para o GAME_CONFIG, mantendo as referências dos objetos */
    private aplicarPerfilCarro(perfil: PerfilCarro) {
        Object.assign(this.config.carro.dimensoes, perfil.dimensoes);
        Object.assign(this.config.carro.rodas, perfil.rodas);
        Object.assign(this.config.carro.fisica, perfil.fisica);
    }

    setConfigAberto(aberto: boolean) { this.configAberto = aberto; }
    setMouseSobreUI(sobre: boolean) { this.mouseSobreUI = sobre; }
    marcarConfigAlterada() { this.painelAlterado = true; }
    /** seed atual do mundo (mostrada no painel do terreno) */
    getSeed() { return this.world.seedPista; }

    async iniciar() {
        if (this.descartado) return;
        this.aplicarPerfilCarro(this.estadoCarroVermelho);

        // a seed do mundo vem de ?seed=... ou é sorteada
        const s = Number(new URLSearchParams(location.search).get('seed'));
        this.world.iniciar(Number.isFinite(s) && s > 0 ? s >>> 0 : sementeAleatoria());
        this.veiculo.init();

        this.renderizador.scene.add(this.world.terrenoGrupo);
        this.renderizador.scene.add(this.world.gramaMesh);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < this.world.florestaMeshes[i].length; j++) {
                if (this.world.florestaMeshes[i][j]) this.renderizador.scene.add(this.world.florestaMeshes[i][j]);
            }
        }

        this.carro = new CarroVisual(this.renderizador.scene, this.veiculo, this.matOpaco, this.config);
        this.carro.carregarModeloPadrao();

        this.efeitos = new EfeitosDrift(
            this.renderizador.scene, this.uniforms, this.veiculo,
            (x, z) => this.world.estrada.estaNoAsfalto(x, z), this.config,
        );

        this.reposicionarCarro();   // monta os chunks (terreno + vegetação) em volta da largada
        this.emitirStats();
        this.configAnterior = structuredClone(this.config);

        this.lastTime = performance.now() / 1000;
        this.rodando = true;
        this.rafId = requestAnimationFrame(this.loop);
    }

    /**
     * Tecla R: leva o carro ao ponto mais próximo da linha central da pista, parado e apontado para o sentido
     * da pista que combina com para onde ele estava virado (assim também serve para virar o carro ao contrário).
     * É também como o carro é colocado na largada (a pista passa pela origem, no sentido +z).
     */
    private reposicionarCarro() {
        const p = this.veiculo.getPosicao(), yaw = this.veiculo.getYawAngle();
        this.world.atualizarChunks(p.x, p.z, Infinity);       // garante terreno e pista em volta de onde o carro está

        let x = 0, z = 0, dx = 0, dz = 1;
        const proj = this.world.estrada.projetar(p.x, p.z);
        if (proj) {
            x = proj.x; z = proj.z; dx = proj.dirX; dz = proj.dirZ;
            if (dx * Math.sin(yaw) + dz * Math.cos(yaw) < 0) { dx = -dx; dz = -dz; }
        }
        this.world.atualizarChunks(x, z, Infinity);           // e em volta do destino, se for longe

        this.veiculo.invalidarSolo();
        this.veiculo.reposicionarNaPista({ x, y: this.world.terreno.obterAlturaMundo(x, z), z }, { x: dx, y: 0, z: dz });
        this.trabalhoPesadoNoFrame = true;
        this.forcarSombra = true;   // o carro pulou de lugar: o mapa de sombras antigo não serve mais
    }

    /**
     * Troca a seed do mundo: recalcula relevo, pista e vegetação e volta o carro à largada.
     * Ainda não há botão no menu do terreno chamando isto (fica para depois).
     */
    reiniciarSeed(seed: number = sementeAleatoria()) {
        this.world.definirSeed(seed);
        const p = this.veiculo.getPosicao();
        this.world.reconstruirTerreno(p.x, p.z);   // refaz também a pista e a vegetação dos chunks
        this.terrenoDefasado = false;
        this.vegetacaoPendente = false;
        this.veiculo.init();                       // de volta à origem, onde a pista da nova seed também passa
        this.reposicionarCarro();
        this.emitirStats();
    }

    private alternarModoCarro() {
        if (this.modoCarroGLB) {
            this.estadoCarroGLB = structuredClone(this.config.carro);
        } else {
            this.estadoCarroVermelho = structuredClone(this.config.carro);
        }

        this.modoCarroGLB = !this.modoCarroGLB;
        this.aplicarPerfilCarro(this.modoCarroGLB ? this.estadoCarroGLB : this.estadoCarroVermelho);

        this.veiculo.reconstruirGeometria();
        this.carro.reconstruirRodas();
        this.efeitos.setLarguraRastro(this.config.carro.rodas.largura);

        if (this.modoCarroGLB) this.carro.aplicarModeloEmCache();
        else this.carro.mostrarProcedural();

        this.configAnterior = structuredClone(this.config);
        this.opcoes.onConfigRecarregada?.();
        this.emitirStats();
    }

    public async carregarModeloGLBLocal(arquivo: File) {
        try {
            await this.carro.importarArquivo(arquivo);

            if (!this.modoCarroGLB) this.alternarModoCarro();
            else this.carro.aplicarModeloEmCache();
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
        const opcoesMudou = mudou(c.opcoes, a.opcoes);
        const terrenoMudou = mudou(c.terreno.parametros, a.terreno.parametros) || mudou(c.estrada.estrada, a.estrada.estrada);

        if (carroMudou) {
            this.veiculo.reconstruirGeometria();
            this.carro.atualizarDimensoes();
            this.efeitos.setLarguraRastro(c.carro.rodas.largura);
        }

        if (arvoreMudou) { this.world.construirFlorestaGeometrias(); this.vegetacaoPendente = true; }
        if (gramaMudou) {
            this.world.gramaMesh.geometry.dispose();
            this.world.gramaMesh.geometry = geometriaDe(gerarGeometriaTufo(this.config));
            this.vegetacaoPendente = true;
        }

        if (opcoesMudou) this.carro.setRodasVisiveis(c.opcoes.rodasVisiveis);
        if (terrenoMudou) this.terrenoDefasado = true;
        this.configAnterior = structuredClone(c);
    }

    private processarTrabalhoPendente() {
        const arrastando = Entrada.esquerdo;
        const agora = performance.now() / 1000;

        if (this.terrenoDefasado && (!arrastando || agora >= this.proximaRegenTerreno)) {
            const inicio = performance.now() / 1000;
            const p = this.veiculo.getPosicao();
            this.world.reconstruirTerreno(p.x, p.z);
            this.veiculo.invalidarSolo();

            const fim = performance.now() / 1000;
            this.proximaRegenTerreno = fim + Math.max(0.15, (fim - inicio) * 3.0);

            this.terrenoDefasado = false; this.trabalhoPesadoNoFrame = true;   // reconstruirTerreno já refaz a vegetação
        }

        if (this.vegetacaoPendente && !arrastando) {
            this.world.regerarVegetacao();
            this.vegetacaoPendente = false; this.trabalhoPesadoNoFrame = true;
        }
    }

    private renderizarSombra(lightDir: THREE.Vector3, p: { x: number; y: number; z: number }) {
        this.alvoSombraTmp.set(p.x, p.y, p.z);
        this.renderizador.sombra.atualizarMatriz(lightDir, this.alvoSombraTmp);

        this.world.gramaMesh.visible = false;
        this.efeitos.setVisivel(false);
        this.world.atualizarFlorestaLods(p, true);
        this.world.modoSombra(true, p.x, p.z);

        const r = this.renderizador.renderer;
        r.setRenderTarget(this.renderizador.sombra.alvo);
        r.clear(true, true, false);

        this.renderizador.scene.overrideMaterial = this.renderizador.sombra.materialProfundidade;
        this.renderizador.render();
        this.renderizador.scene.overrideMaterial = null;
        r.setRenderTarget(null);

        this.world.modoSombra(false, p.x, p.z);
        this.uniforms.uShadowOn.value = 1;
        this.world.gramaMesh.visible = true;
        this.efeitos.setVisivel(true);
    }

    private loop = () => {
        if (!this.rodando) return;
        this.rafId = requestAnimationFrame(this.loop);

        this.trabalhoPesadoNoFrame = false;
        const w = window.innerWidth, h = window.innerHeight;
        if (w === 0 || h === 0) return;

        if (Entrada.teclaUmaVez('KeyX')) this.alternarModoCarro();

        if (this.controle.detectarTrocaDeCarro()) this.alternarModoCarro();

        if (Entrada.teclaUmaVez('KeyQ')) {
            this.wireframe = !this.wireframe;
            this.matOpaco.wireframe = this.wireframe;
            this.efeitos.setWireframe(this.wireframe);
            this.carro.setWireframe(this.wireframe);
        }
        if (Entrada.teclaUmaVez('KeyR')) this.reposicionarCarro();

        const { throttle, steer, handbrake, carregandoPulo } = this.controle.ler(this.veiculo, this.world.estrada, this.mouseSobreUI);
        this.veiculo.setSegurandoPulo(carregandoPulo);

        const thisTime = performance.now() / 1000;
        let deltaTime = thisTime - this.lastTime;
        this.lastTime = thisTime;
        this.renderizador.ajustarResolucao(deltaTime);   // resolução dinâmica: usa o tempo real do frame
        deltaTime = Math.min(deltaTime, 0.05);

        this.veiculo.update(deltaTime, throttle, steer, handbrake, this.world.alturaSuperficie);
        { const pc = this.veiculo.getPosicao(); this.world.atualizarChunks(pc.x, pc.z); }
        this.efeitos.atualizar(deltaTime);

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

        const lerpCam = lerpFactorDt(0.08, Math.min(deltaTime * 60, 3.0));
        this.camOffsetX += (targetOffX - this.camOffsetX) * lerpCam;
        this.camOffsetY += (targetOffY - this.camOffsetY) * lerpCam;

        if (Math.abs(this.camOffsetX) > 1 || Math.abs(this.camOffsetY) > 1) {
            this.renderizador.camera.setViewOffset(w, h, this.camOffsetX, this.camOffsetY, w, h);
        } else {
            this.renderizador.camera.clearViewOffset();
        }

        this.renderizador.camera.updateProjectionMatrix();
        atualizarLuz(this.uniforms);
        this.renderizador.sincronizarLuzes();

        const l = this.config.luz.parametros;
        const lightDir = this.lightDirTmp.set(l.dirX, l.dirY, l.dirZ);

        this.carro.atualizar();

        const redesenharSombra = this.forcarSombra || this.quadroSombra === 0;
        this.quadroSombra = (this.quadroSombra + 1) % INTERVALO_SOMBRA;
        if (redesenharSombra) {
            this.forcarSombra = false;
            this.renderizarSombra(lightDir, this.veiculo.getPosicao());
        }
        // a sombra é relativa: a matriz usada na tela depende da posição da câmera, então é refeita todo frame
        this.renderizador.sombra.atualizarParaCamera(this.renderizador.camera.position);
        this.world.atualizarFlorestaLods(this.renderizador.camera.position, false);

        const nG = this.world.grama.selecionar(this.renderizador.camera.position, false, this.world.gramaLote);
        this.world.atualizarGrama();
        this.world.gramaMesh.count = nG;

        const e = this.renderizador.camera.matrixWorld.elements;
        this.efeitos.atualizarGeometria(new THREE.Vector3(e[0], e[1], e[2]), new THREE.Vector3(e[4], e[5], e[6]));

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

        this.world.dispose();   // materiais e texturas das máscaras da pista (as geometrias o traverse abaixo cuida)
        this.renderizador.scene.traverse((o: any) => {
            if (o.geometry) o.geometry.dispose();
        });

        this.carro?.dispose();
        this.matOpaco.dispose();
        this.efeitos?.dispose();
        this.renderizador.dispose();
    }
}