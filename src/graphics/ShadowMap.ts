// ShadowMap.ts — port de ShadowMap.h: mapa de sombras direcional 4096x4096 (ortográfico, caixa de 2400).
import * as THREE from 'three';
import type { UniformsCompartilhados } from './materialPrincipal';
import { criarMaterialProfundidade } from './materialPrincipal';

export class ShadowMap {
    readonly largura: number;
    readonly altura: number;
    readonly alvo: THREE.WebGLRenderTarget;
    readonly materialProfundidade: THREE.ShaderMaterial;
    readonly lightSpaceMatrix = new THREE.Matrix4();

    constructor(private uniforms: UniformsCompartilhados, w = 4096, h = 4096) {
        this.largura = w; this.altura = h;

        const depth = new THREE.DepthTexture(w, h);
        depth.format = THREE.DepthFormat;
        depth.type = THREE.UnsignedIntType;
        depth.minFilter = THREE.NearestFilter;   // WebGL2 não filtra textura de profundidade sem compare
        depth.magFilter = THREE.NearestFilter;
        depth.wrapS = THREE.ClampToEdgeWrapping;
        depth.wrapT = THREE.ClampToEdgeWrapping;

        this.alvo = new THREE.WebGLRenderTarget(w, h, {
            format: THREE.RedFormat,             // anexo de cor mínimo (só a profundidade interessa)
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            depthTexture: depth,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            generateMipmaps: false,
        });
        this.materialProfundidade = criarMaterialProfundidade(uniforms);

        uniforms.uShadowMap.value = depth;
        uniforms.uShadowTexel.value.set(1 / w, 1 / h);
    }

    /** begin(): calcula lightSpaceMatrix = ortho * lookAt(alvo + dir * 1800, alvo) */
    atualizarMatriz(lightDir: THREE.Vector3, targetPos: THREE.Vector3) {
        const raio = 1200;
        const proj = new THREE.Matrix4().makeOrthographic(-raio, raio, raio, -raio, 1, 4000);
        const dir = lightDir.clone().normalize();
        const lightPos = targetPos.clone().add(dir.multiplyScalar(1800));
        const cam = new THREE.Matrix4().lookAt(lightPos, targetPos, new THREE.Vector3(0, 1, 0));
        cam.setPosition(lightPos);
        const view = cam.invert();
        this.lightSpaceMatrix.multiplyMatrices(proj, view);
        this.uniforms.uLightSpaceMatrix.value.copy(this.lightSpaceMatrix);
    }

    dispose() { this.alvo.dispose(); this.alvo.depthTexture?.dispose(); this.materialProfundidade.dispose(); }
}
