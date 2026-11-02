import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { ShadowMap } from './ShadowMap';
import type { UniformsCompartilhados } from './materialPrincipal';

const NEAR_PLANE = 0.3;
const FAR_PLANE = 15000;

export class Renderer {
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public sombra: ShadowMap;

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
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        const l = GAME_CONFIG.luz.parametros;
        dirLight.position.set(l.dirX, l.dirY, l.dirZ).normalize().multiplyScalar(500);
        this.scene.add(dirLight);
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