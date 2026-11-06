import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { ShadowMap } from './ShadowMap';
import type { UniformsCompartilhados } from './materialPrincipal';

const NEAR_PLANE = 0.3;
const FAR_PLANE = 15000;

/**
 * As luzes do three (usadas só por materiais embutidos, como os do .glb) seguem os mesmos parâmetros do shader
 * do jogo. O three trabalha em unidades físicas (o difuso é dividido por pi), então a intensidade do jogo
 * é multiplicada por pi. Ajuste aqui se o carro ficar mais claro/escuro que o resto.
 */
const ESCALA_LUZ_THREE = Math.PI;

export class Renderer {
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public sombra: ShadowMap;

    private readonly luzAmbiente = new THREE.AmbientLight(0xffffff, 1);
    private readonly luzSol = new THREE.DirectionalLight(0xffffff, 1);

    constructor(private canvas: HTMLCanvasElement, uniforms: UniformsCompartilhados) {
        // Inicialização WebGL
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(new THREE.Color().setRGB(0.8, 0.85, 0.9, THREE.SRGBColorSpace), 1);

        // Cena e Câmara
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
        this.scene.add(this.luzSol);   // o alvo padrão é a origem: a direção é só a posição normalizada
        this.sincronizarLuzes();
    }

    /** copia a config de luz do jogo (direção, cor, intensidades) para as luzes do three; chamar a cada frame */
    public sincronizarLuzes() {
        const l = GAME_CONFIG.luz.parametros;
        this.luzAmbiente.color.setRGB(l.corR, l.corG, l.corB);
        this.luzAmbiente.intensity = l.intensidadeAmbiente * ESCALA_LUZ_THREE;
        this.luzSol.color.setRGB(l.corR, l.corG, l.corB);
        this.luzSol.intensity = l.intensidadeDifusa * ESCALA_LUZ_THREE;
        this.luzSol.position.set(l.dirX, l.dirY, l.dirZ).normalize().multiplyScalar(500);
    }

    private redimensionar = () => {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
    };

    public render() {
        this.renderer.render(this.scene, this.camera);
    }

    public dispose() {
        window.removeEventListener('resize', this.redimensionar);
        this.sombra.dispose();
        this.renderer.dispose();
    }
}