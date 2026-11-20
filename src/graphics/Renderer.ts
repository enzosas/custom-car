import * as THREE from 'three';
import { ShadowMap } from './ShadowMap';
import type { Atmosfera } from './Atmosfera';
import type { UniformsCompartilhados } from './materialPrincipal';

const NEAR_PLANE = 0.03;   // m
const FAR_PLANE = 1500;    // m

/**
 * As luzes do three (usadas só por materiais embutidos, como os do .glb) seguem os mesmos parâmetros do shader
 * do jogo. O three trabalha em unidades físicas (o difuso é dividido por pi), então a intensidade do jogo é
 * multiplicada por pi. Ajuste aqui se o carro ficar mais claro/escuro que o resto.
 */
const ESCALA_LUZ_THREE = Math.PI;

// ---- resolução ----
/** teto do pixel ratio: telas retina (2x/3x) desenhavam 4x–9x mais pixels do que o necessário */
const PIXEL_RATIO_TETO = 1.5;
/** o MSAA só vale a pena em telas 1x; em telas de alta densidade os pixels já são pequenos */
const LIMITE_DPR_MSAA = 1.5;

// ---- resolução dinâmica (baixa a resolução quando o FPS cai e sobe de volta quando sobra folga) ----
const RESOLUCAO_DINAMICA = true;
const RAZAO_MINIMA = 0.5;
const JANELA_FRAMES = 40;           // frames medidos antes de cada decisão
const BAIXAR_ACIMA_DE_MS = 21;      // média de frame acima disso (< ~47 fps): reduz
const SUBIR_ABAIXO_DE_MS = 17.5;    // média de frame abaixo disso (>= ~57 fps): tenta subir
const PASSO_BAIXAR = 0.1;
const PASSO_SUBIR = 0.05;

export class Renderer {
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public sombra: ShadowMap;

    private readonly luzAmbiente = new THREE.AmbientLight(0xffffff, 1);
    private readonly corCeuTmp = new THREE.Color();
    private readonly luzSol = new THREE.DirectionalLight(0xffffff, 1);

    // estado da resolução dinâmica
    private readonly razaoMax: number;
    private razao: number;
    private somaDt = 0;
    private amostras = 0;
    private tempoDesdeMudanca = 0;
    private esperaParaSubir = 5;    // segundos; dobra quando subir resulta em ter que descer de novo
    private ultimaMudanca: 'baixou' | 'subiu' | null = null;

    /** 0 = resolução dinâmica (padrão); > 0 = altura interna FIXA do buffer, em pixels (estilo PS2) */
    private alturaFixa = 0;

    constructor(private canvas: HTMLCanvasElement, uniforms: UniformsCompartilhados) {
        const dpr = window.devicePixelRatio || 1;
        this.razaoMax = Math.min(dpr, PIXEL_RATIO_TETO);
        this.razao = this.razaoMax;

        // Inicializa o WebGL
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: dpr < LIMITE_DPR_MSAA,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(this.razao);
        // Convenção de cor do jogo: valores CRUS, sem gama. O shader do terreno, da pista e das marcações escreve o
        // resultado da luz direto; os materiais do three (o carro .glb) codificariam em sRGB na saída, o que clareia os
        // tons escuros (à noite, uma luz de 0.2 viraria ~0.48 e o carro brilharia mais que a pista). Linear = sem codificar.
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        // Cena e Câmera
        this.scene = new THREE.Scene();
        this.scene.matrixWorldAutoUpdate = true;

        const w = window.innerWidth, h = window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, w / Math.max(1, h), NEAR_PLANE, FAR_PLANE);

        // Sombras
        this.sombra = new ShadowMap(uniforms);

        // Luzes base
        this.configurarLuzes();

        // Eventos
        this.redimensionar();
        window.addEventListener('resize', this.redimensionar);
    }

    private configurarLuzes() {
        this.scene.add(this.luzAmbiente);
        this.scene.add(this.luzSol);   // o alvo padrão é a origem: a direção é a posição normalizada
        // as cores e a direção vêm da atmosfera do frame: o Jogo chama sincronizarLuzes(atmosfera) todo frame
    }

    /** copia a config de luz do jogo (direção, cor, intensidades) para as luzes do three; chamar a cada frame */
    public sincronizarLuzes(a: Atmosfera) {
        // Luz ambiente dos materiais nativos (.glb): cor própria, independente do céu
        this.luzAmbiente.color.setRGB(a.corAmbiente[0], a.corAmbiente[1], a.corAmbiente[2]);
        this.luzAmbiente.intensity = a.intAmbiente * ESCALA_LUZ_THREE;

        // A luz do mundo (sol de dia, luar à noite) continua independente
        this.luzSol.color.setRGB(a.corLuz[0], a.corLuz[1], a.corLuz[2]);
        this.luzSol.intensity = a.intDifusa * ESCALA_LUZ_THREE;
        this.luzSol.position.set(a.dirLuz[0], a.dirLuz[1], a.dirLuz[2]).multiplyScalar(50);

        // O fundo da tela é a cor do horizonte (o domo do céu cobre quase tudo, mas isto evita falhas)
        this.renderer.setClearColor(this.corCeuTmp.setRGB(a.corHorizonte[0], a.corHorizonte[1], a.corHorizonte[2]), 1);   // sem conversão: valores crus
    }

    private redimensionar = () => {
        const w = window.innerWidth, h = window.innerHeight;
        if (this.alturaFixa > 0) {
            // altura interna fixa: a razão acompanha a altura da janela (limitada ao teto, para não desenhar mais que o necessário)
            this.razao = Math.ceil(Math.min(this.razaoMax, this.alturaFixa / Math.max(1, h)) * 10000) / 10000;   // para cima: o buffer fecha em exatamente alturaFixa linhas
            this.renderer.setPixelRatio(this.razao);
        }
        this.renderer.setSize(w, h, false);
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
    };

    /**
     * Estilo PS2: desenha numa altura interna fixa (ex.: 480) e deixa o navegador ampliar o canvas com filtro bilinear,
     * que é o que dá a imagem macia do PS2 (e esconde os recortes das árvores). 0 volta à resolução dinâmica.
     * Enquanto estiver fixa, a resolução dinâmica não mexe em nada.
     */
    public definirAlturaInterna(px: number) {
        const v = px > 0 ? Math.max(120, Math.round(px)) : 0;
        if (v === this.alturaFixa) return;
        this.alturaFixa = v;
        if (v > 0) {
            this.redimensionar();
        } else {
            this.somaDt = 0; this.amostras = 0; this.tempoDesdeMudanca = 0; this.ultimaMudanca = null;
            this.definirRazao(this.razaoMax);
        }
    }

    /** escala atual do buffer de desenho em relação à janela (1 = um pixel por pixel CSS) */
    public getEscalaResolucao() { return this.razao; }

    /**
     * Resolução dinâmica: chamar uma vez por frame com o tempo real do frame (em segundos).
     * Mede a média de uma janela de frames; se estiver lento, reduz o pixel ratio; se houver folga por um tempo,
     * sobe aos poucos (com espera crescente, para não ficar oscilando entre dois valores).
     */
    public ajustarResolucao(dt: number) {
        if (!RESOLUCAO_DINAMICA || this.alturaFixa > 0) return;
        if (!(dt > 0) || dt > 0.5) return;   // aba em segundo plano, pausa do depurador etc.

        this.somaDt += Math.min(dt, 0.1);    // um engasgo isolado não deve derrubar a resolução
        this.amostras++;
        this.tempoDesdeMudanca += dt;
        if (this.amostras < JANELA_FRAMES) return;

        const mediaMs = (this.somaDt / this.amostras) * 1000;
        this.somaDt = 0; this.amostras = 0;

        if (mediaMs > BAIXAR_ACIMA_DE_MS && this.razao > RAZAO_MINIMA) {
            if (this.ultimaMudanca === 'subiu') this.esperaParaSubir = Math.min(this.esperaParaSubir * 2, 60);
            this.definirRazao(this.razao - PASSO_BAIXAR);
            this.ultimaMudanca = 'baixou';
        } else if (mediaMs < SUBIR_ABAIXO_DE_MS && this.razao < this.razaoMax
            && this.tempoDesdeMudanca >= this.esperaParaSubir) {
            this.definirRazao(this.razao + PASSO_SUBIR);
            this.ultimaMudanca = 'subiu';
        }
    }

    private definirRazao(r: number) {
        this.razao = Math.round(Math.min(this.razaoMax, Math.max(RAZAO_MINIMA, r)) * 100) / 100;
        this.tempoDesdeMudanca = 0;
        this.renderer.setPixelRatio(this.razao);
        this.redimensionar();
    }

    public render() {
        this.renderer.render(this.scene, this.camera);
    }

    public dispose() {
        window.removeEventListener('resize', this.redimensionar);
        this.sombra.dispose();
        this.renderer.dispose();
    }
}