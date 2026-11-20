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
import { lerpFactorDt, Mat4, Y_AXIS } from '@/graphics/Mat4';
import { sementeAleatoria } from './Random';
import { geometriaDe } from '@/graphics/Malha';
import { Renderer } from '@/graphics/Renderer';
import { tirarPerfilEstilo, aplicarPerfilEstilo } from './perfilEstilo';
import { CAMADA_ARVORE_PS2 } from '@/graphics/ShadowMap';
import { Ceu } from '@/graphics/Ceu';
import { calcularAtmosfera, criarAtmosfera, type PerfilAtmosferaPS2 } from '@/graphics/Atmosfera';
import { WorldBuilder } from '@/world/WorldBuilder';
import { gerarGeometriaTufo } from '@/world/Grama';
import { liberarTexturasPS2 } from '@/graphics/texturasPS2';
import {
    criarUniformsCompartilhados,
    criarMaterialPrincipal,
    criarMaterialMarcacao,
    criarMaterialTerreno,
    criarMaterialVegetacao,
    criarMaterialArvorePS2,
    atualizarLuz,
} from '@/graphics/materialPrincipal';

/** configurações com que o estilo retro começa: as do low poly, com as árvores maiores e mais grossas (cartões de frente, como no GT4) */
function perfilInicialRetro(): Record<string, unknown> {
    const perfil = tirarPerfilEstilo(GAME_CONFIG) as { arvore: typeof GAME_CONFIG.arvore };
    perfil.arvore.arvores.alturaTronco = 30;   // m
    perfil.arvore.arvores.raioTronco = 1;      // m
    return perfil;
}

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
    // temporários da câmera presa ao chassi (opção camera.parametros.seguirChassi)
    private readonly camPos = new THREE.Vector3();
    private readonly camAlvo = new THREE.Vector3();
    private readonly camUp = new THREE.Vector3();
    private readonly matTmpA = new THREE.Matrix4();
    private readonly matTmpB = new THREE.Matrix4();

    private matOpaco = criarMaterialPrincipal(this.uniforms);
    private matMarcacao = criarMaterialMarcacao(this.uniforms);
    private matTerreno = criarMaterialTerreno(this.uniforms);
    private matArvore = criarMaterialVegetacao(this.uniforms);
    private matArvoreCruz = criarMaterialArvorePS2(this.uniforms, false);
    private matArvoreFace = criarMaterialArvorePS2(this.uniforms, true);
    private matGrama = criarMaterialVegetacao(this.uniforms);

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
    private readonly perfilAtmPS2: PerfilAtmosferaPS2 = { neblinaInicio: 0, neblinaFim: 0, tomHorizonte: 0 };   // ajustes do estilo PS2, reaproveitado a cada frame
    private readonly atm = criarAtmosfera();       // sol e cores do frame (ver Atmosfera.ts)
    private ceu!: Ceu;
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
    /** memória das configurações de cada estilo (chave: estiloPS2). Os dois começam nos valores padrão; ver perfilEstilo.ts */
    private perfisEstilo = new Map<boolean, Record<string, unknown>>([[false, tirarPerfilEstilo(GAME_CONFIG)], [true, perfilInicialRetro()]]);

    constructor(canvas: HTMLCanvasElement, opcoes: JogoOpcoes = {}) {
        this.opcoes = opcoes;
        this.controle = new ControleJogador(opcoes.controlesToque ?? criarControlesToque());
        this.renderizador = new Renderer(canvas, this.uniforms);
        this.world = new WorldBuilder(this.matMarcacao, this.matTerreno, this.matArvore, this.matArvoreCruz, this.matArvoreFace, this.matGrama, this.config);
        this.ceu = new Ceu(this.renderizador.scene, this.uniforms);
        Entrada.iniciar(canvas);
    }

    /** copia um perfil de carro (dimensões, rodas, física) para o GAME_CONFIG, mantendo as referências dos objetos */
    private aplicarPerfilCarro(perfil: PerfilCarro) {
        Object.assign(this.config.carro.dimensoes, perfil.dimensoes);
        Object.assign(this.config.carro.rodas, perfil.rodas);
        Object.assign(this.config.carro.fisica, perfil.fisica);
        Object.assign(this.config.carro.suspensao, perfil.suspensao);
    }

    setConfigAberto(aberto: boolean) { this.configAberto = aberto; }
    setMouseSobreUI(sobre: boolean) { this.mouseSobreUI = sobre; }
    marcarConfigAlterada() { this.painelAlterado = true; }
    /** seed atual do mundo (mostrada no painel do terreno) */
    getSeed() { return this.world.seedPista; }
    /** true se o perfil de carro ativo é o do modelo GLB (o painel usa isso para saber o valor original dos campos do carro) */
    getModoCarroGLB() { return this.modoCarroGLB; }

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
            for (const m of this.world.florestaMeshesPS2[i]) this.renderizador.scene.add(m);   // cartões do estilo PS2
        }

        this.renderizador.camera.layers.enable(CAMADA_ARVORE_PS2);   // cartões de árvore do estilo PS2 (ver ShadowMap)
        this.aplicarEstiloVisual();
        // public/texturas/ (grama.jpg, arvore1.png...), se existirem; a sombra dos cartões passa a recortar com o atlas novo
        void this.world.carregarTexturasExternas().then(() => {
            this.renderizador.sombra.materialProfundidadeArvore.uniforms.uTexArvore.value = this.matArvoreFace.uniforms.uTexArvore.value;
        });

        this.carro = new CarroVisual(this.renderizador.scene, this.veiculo, this.matOpaco, this.config);
        this.carro.carregarModeloPadrao();

        this.efeitos = new EfeitosDrift(
            this.renderizador.scene, this.uniforms, this.veiculo,
            (x, z) => this.world.estrada.estaNoAsfalto(x, z),
            (x, z, saida) => this.world.terreno.superficieEm(x, z, saida), this.config,
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
            this.aplicarMedidasDoModelo();
            console.log(`Modelo ${arquivo.name} importado com sucesso!`);
        } catch (err) {
            console.error('Falha ao processar o ficheiro .glb:', err);
            alert('Erro ao carregar o modelo .glb.');
        }
    }

    /** ajusta entre eixos, distância entre rodas, offset, altura e raio às rodas do .glb recém-importado (se ele tiver wheelFL/FR/RL/RR) */
    private aplicarMedidasDoModelo() {
        const m = this.carro.medidasEstimadas();
        if (!m) return;
        const { dimensoes, rodas } = this.config.carro;
        dimensoes.comprimentorodas = m.comprimentorodas;
        dimensoes.largurarodas = m.largurarodas;
        dimensoes.offsetchassi = m.offsetchassi;
        dimensoes.alturachao = m.alturachao;
        rodas.raio = m.raio;
        rodas.largura = m.larguraRoda;

        this.veiculo.reconstruirGeometria();
        this.carro.atualizarDimensoes();
        this.efeitos.setLarguraRastro(rodas.largura);
        this.reposicionarCarro();
        this.estadoCarroGLB = structuredClone(this.config.carro);
        this.configAnterior = structuredClone(this.config);
        this.opcoes.onConfigRecarregada?.();   // o painel mostra os novos valores
        this.emitirStats();
        console.log('Medidas estimadas das rodas do modelo:', m);
    }

    /**
     * Câmera presa ao CHASSI: a CameraJogo calcula a órbita só com a posição e a direção do carro (sem seguir o
     * terreno, ver Camera.ts), e aqui ela recebe toda a orientação da carroceria por cima disso: a inclinação do
     * terreno, a atitude no ar durante o pulo e o movimento da suspensão. Assim o ângulo entre câmera e chassi fica
     * fixo (só a direção horizontal mantém o atraso da câmera de perseguição). O estado suavizado da câmera não muda.
     */
    private prenderCameraAoChassi() {
        const p = this.veiculo.getPosicao();
        const referencia = this.matTmpA.fromArray(Mat4.translation(p).rotate(this.veiculo.getYawAngle(), Y_AXIS).m);
        const chassi = this.matTmpB.fromArray(this.veiculo.matrizChassi().m);
        const d = chassi.multiply(referencia.invert());     // chassi · referência⁻¹: a orientação da carroceria, no mundo
        this.camPos.applyMatrix4(d);
        this.camAlvo.applyMatrix4(d);
        this.camUp.transformDirection(d);
        // girando junto com a carroceria a câmera pode descer: não deixa entrar no chão (mesma margem da CameraJogo)
        const chao = this.world.alturaSuperficie(this.camPos.x, this.camPos.z) + 0.4;
        if (this.camPos.y < chao) this.camPos.y = chao;
    }

    /** aplica ao mundo o estilo escolhido em config.opcoes.estiloPS2 (idempotente) */
    private aplicarEstiloVisual() {
        const ps2 = this.config.opcoes.estiloPS2;
        this.world.definirEstilo(ps2);
        // a sombra dos cartões recorta o contorno com o MESMO atlas que o quadro principal desenha
        this.renderizador.sombra.materialProfundidadeArvore.uniforms.uTexArvore.value = this.matArvoreFace.uniforms.uTexArvore.value;
        this.ceu?.definirEstilo(ps2);
        this.renderizador.definirAlturaInterna(ps2 ? this.config.opcoes.alturaInternaPS2 : 0);
    }

    /** tecla G: alterna low poly <-> PS2. A troca de memória e a reconstrução do que mudou acontecem em aplicarMudancasDoPainel */
    private alternarEstiloVisual() {
        this.config.opcoes.estiloPS2 = !this.config.opcoes.estiloPS2;
        this.aplicarMudancasDoPainel();
        this.opcoes.onConfigRecarregada?.();   // o painel (botões e valores) acompanha
    }

    /**
     * O estilo mudou (botões do painel ou tecla G): guarda as configurações atuais no estilo que saiu e traz de volta as
     * do que entrou. O que ficar diferente (terreno, árvores, grama...) é reconstruído pelo diff de aplicarMudancasDoPainel.
     */
    private trocarMemoriaDeEstilo(de: boolean, para: boolean) {
        this.perfisEstilo.set(de, tirarPerfilEstilo(this.config));
        aplicarPerfilEstilo(this.config, this.perfisEstilo.get(para)!);
        this.opcoes.onConfigRecarregada?.();
    }

    private aplicarMudancasDoPainel() {
        const c = this.config, a = this.configAnterior;
        if (c.opcoes.estiloPS2 !== a.opcoes.estiloPS2) this.trocarMemoriaDeEstilo(a.opcoes.estiloPS2, c.opcoes.estiloPS2);
        const carroMudou = mudou(c.carro.dimensoes, a.carro.dimensoes) || mudou(c.carro.rodas, a.carro.rodas);
        const arvoreMudou = mudou(c.arvore.arvores, a.arvore.arvores);
        const gramaMudou = mudou(c.grama.grama, a.grama.grama);
        const opcoesMudou = mudou(c.opcoes, a.opcoes);
        // a geometria da pista reconstrói o terreno; as marcações (só visual) só refazem as faixas
        const geoPista = (e: typeof c.estrada.estrada) => ({
            largura: e.largura, anguloCurva: e.anguloCurva, comprimentoCurva: e.comprimentoCurva, larguraTransicao: e.larguraTransicao,
        });
        const marcasPista = (e: typeof c.estrada.estrada) => ({
            marcacoes: e.marcacoes, linhaLargura: e.linhaLargura, linhaMargem: e.linhaMargem, tracoComprimento: e.tracoComprimento, tracoVao: e.tracoVao,
        });
        const terrenoMudou = mudou(c.terreno.parametros, a.terreno.parametros) || mudou(c.terreno.paleta, a.terreno.paleta)
            || mudou(geoPista(c.estrada.estrada), geoPista(a.estrada.estrada));
        if (!terrenoMudou && mudou(marcasPista(c.estrada.estrada), marcasPista(a.estrada.estrada))) this.world.regerarMarcacoes();

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

        if (opcoesMudou) { this.carro.setRodasVisiveis(c.opcoes.rodasVisiveis); this.aplicarEstiloVisual(); }
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
        const op = this.config.opcoes;
        this.renderizador.sombra.configurar(op.alcanceSombra, 1024 * 2 ** (Math.round(op.qualidadeSombra) - 1));
        this.renderizador.sombra.atualizarMatriz(lightDir, this.alvoSombraTmp);

        this.world.gramaMesh.visible = false;
        this.ceu.setVisivel(false);
        this.efeitos.setVisivel(false);
        this.world.atualizarFlorestaLods(p, true);
        this.world.modoSombra(true, p.x, p.z);

        const r = this.renderizador.renderer;
        r.setRenderTarget(this.renderizador.sombra.alvo);
        r.clear(true, true, false);

        // passada 1: tudo, menos os cartões de árvore (profundidade simples). passada 2: só os cartões (alpha test),
        // sem limpar o mapa. O autoClear do three apagaria a passada 1, então fica desligado entre as duas.
        const cam = this.renderizador.camera;
        const mascara = cam.layers.mask;
        const autoClear = r.autoClear;
        cam.layers.set(0);
        this.renderizador.scene.overrideMaterial = this.renderizador.sombra.materialProfundidade;
        this.renderizador.render();
        if (this.world.estiloPS2) {
            cam.layers.set(CAMADA_ARVORE_PS2);
            r.autoClear = false;
            this.renderizador.scene.overrideMaterial = this.renderizador.sombra.materialProfundidadeArvore;
            this.renderizador.render();
        }
        r.autoClear = autoClear;
        cam.layers.mask = mascara;
        this.renderizador.scene.overrideMaterial = null;
        r.setRenderTarget(null);

        this.world.modoSombra(false, p.x, p.z);
        this.uniforms.uShadowOn.value = 1;
        this.world.gramaMesh.visible = true;
        this.ceu.setVisivel(true);
        this.efeitos.setVisivel(true);
    }

    private loop = () => {
        if (!this.rodando) return;
        this.rafId = requestAnimationFrame(this.loop);

        this.trabalhoPesadoNoFrame = false;
        const w = window.innerWidth, h = window.innerHeight;
        if (w === 0 || h === 0) return;

        if (Entrada.teclaUmaVez('KeyX')) this.alternarModoCarro();
        if (Entrada.teclaUmaVez('KeyG')) this.alternarEstiloVisual();

        if (this.controle.detectarTrocaDeCarro()) this.alternarModoCarro();

        if (Entrada.teclaUmaVez('KeyQ')) {
            this.wireframe = !this.wireframe;
            this.matOpaco.wireframe = this.wireframe;
            this.matMarcacao.wireframe = this.wireframe;
            this.matTerreno.wireframe = this.wireframe;
            this.matArvore.wireframe = this.wireframe;
            this.matArvoreCruz.wireframe = this.wireframe;
            this.matArvoreFace.wireframe = this.wireframe;
            this.matGrama.wireframe = this.wireframe;
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
        this.camPos.set(cp.x, cp.y, cp.z); this.camAlvo.set(ct.x, ct.y, ct.z); this.camUp.set(up.x, up.y, up.z);
        if (this.config.camera.parametros.seguirChassi) this.prenderCameraAoChassi();
        this.renderizador.camera.position.copy(this.camPos);
        this.renderizador.camera.up.copy(this.camUp);
        this.renderizador.camera.lookAt(this.camAlvo);
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
        // hora do dia -> posição do sol e cores do frame (luz, neblina, céu) -> uniforms, luzes do three e céu
        const cc = this.config.ceu.parametros;
        if (cc.cicloAtivo) cc.hora = (cc.hora + deltaTime / Math.max(1, cc.duracaoDia) * 24) % 24;
        const o = this.config.opcoes;
        let perfilAtm: PerfilAtmosferaPS2 | null = null;
        if (o.estiloPS2) {      // neblina e horizonte do estilo PS2 (objeto reaproveitado: sem lixo por frame)
            perfilAtm = this.perfilAtmPS2;
            perfilAtm.neblinaInicio = o.neblinaInicioPS2; perfilAtm.neblinaFim = o.neblinaFimPS2; perfilAtm.tomHorizonte = o.tomHorizontePS2;
        }
        calcularAtmosfera(this.config.luz.parametros, cc, this.atm, perfilAtm);
        atualizarLuz(this.uniforms, this.atm);
        this.renderizador.sincronizarLuzes(this.atm);
        this.ceu.atualizar(deltaTime, this.renderizador.camera.position, this.atm, cc);
        const lightDir = this.lightDirTmp.set(this.atm.dirLuz[0], this.atm.dirLuz[1], this.atm.dirLuz[2]);

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
        this.world.atualizarTexturaChao(this.renderizador.camera.position.x, this.renderizador.camera.position.z,
            this.config.opcoes.escalaTexturaPS2, this.config.opcoes.contrasteGramaPS2, this.config.opcoes.corDetalheGramaPS2,
            this.config.opcoes.contrasteSuperficiesPS2, this.config.opcoes.influenciaCorTerrenoTerraPS2);

        // no estilo PS2 a grama é textura no chão (como no GT4): os tufos 3D não são desenhados nem selecionados
        const nG = this.world.estiloPS2 ? 0 : this.world.grama.selecionar(this.renderizador.camera.position, false, this.world.gramaLote, this.world.gramaLoteCor);
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
        this.matMarcacao.dispose();
        this.matTerreno.dispose();
        this.matArvore.dispose();
        this.matArvoreCruz.dispose();
        this.matArvoreFace.dispose();
        this.matGrama.dispose();
        liberarTexturasPS2();
        this.ceu?.dispose();
        this.efeitos?.dispose();
        this.renderizador.dispose();
    }
}