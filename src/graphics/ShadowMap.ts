// ShadowMap.ts — mapa de sombras direcional (ortográfico, caixa de 2 * RAIO_SOMBRA unidades em volta do alvo).
//
// Mudanças de performance:
//  - resolução padrão 2048x2048 com caixa de 1200 unidades (mesma nitidez do original 4096 com caixa de 2400,
//    mas 4x menos pixels para desenhar e para amostrar);
//  - "texel snapping": a caixa da luz anda em passos de exatamente 1 texel, então a sombra não tremula quando o
//    carro se move (isso também permite redesenhar o mapa a cada N frames sem artefatos);
//  - matrizes e vetores reaproveitados (nada de alocação por frame).
import * as THREE from 'three';
import type { UniformsCompartilhados } from './materialPrincipal';
import { criarMaterialProfundidade } from './materialPrincipal';

/** lado do mapa em texels. 2048 é um bom equilíbrio; use 1024 em aparelhos fracos ou 4096 para a qualidade máxima. */
export const TAMANHO_SOMBRA = 2048;

/**
 * meia largura da caixa ortográfica (a caixa cobre 2 * RAIO_SOMBRA unidades de mundo).
 * Resolução da sombra = 2 * RAIO_SOMBRA / TAMANHO_SOMBRA unidades por texel (600 e 2048 => ~0.59, igual ao
 * 1200 e 4096 do original). Menor raio = sombra mais nítida, porém com menos alcance. O shader faz o fade da
 * sombra nas bordas da caixa, então não precisa mexer lá ao trocar este valor.
 */
export const RAIO_SOMBRA = 600;
const DISTANCIA_LUZ = 1800;

export class ShadowMap {
    readonly largura: number;
    readonly altura: number;
    readonly alvo: THREE.WebGLRenderTarget;
    readonly materialProfundidade: THREE.ShaderMaterial;
    readonly lightSpaceMatrix = new THREE.Matrix4();

    private readonly proj = new THREE.Matrix4();
    private readonly view = new THREE.Matrix4();
    private readonly snap = new THREE.Matrix4();
    private readonly dir = new THREE.Vector3();
    private readonly lightPos = new THREE.Vector3();
    private readonly alvoLuz = new THREE.Vector3();
    private readonly cima = new THREE.Vector3(0, 1, 0);
    /** tamanho de um texel em unidades de mundo */
    private readonly texelMundo: number;

    constructor(private uniforms: UniformsCompartilhados, w = TAMANHO_SOMBRA, h = w) {
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

        this.proj.makeOrthographic(-RAIO_SOMBRA, RAIO_SOMBRA, RAIO_SOMBRA, -RAIO_SOMBRA, 1, 4000);
        this.texelMundo = (2 * RAIO_SOMBRA) / w;

        uniforms.uShadowMap.value = depth;
        uniforms.uShadowTexel.value.set(1 / w, 1 / h);
    }

    /**
     * Calcula lightSpaceMatrix = ortho * lookAt(alvo + dir * 1800, alvo), com o alvo "grudado" na grade de texels.
     * Só chame quando for redesenhar o mapa: a matriz do uniform tem que ser a mesma com que o mapa foi desenhado.
     */
    atualizarMatriz(lightDir: THREE.Vector3, targetPos: THREE.Vector3) {
        this.dir.copy(lightDir).normalize();
        this.lightPos.copy(targetPos).addScaledVector(this.dir, DISTANCIA_LUZ);

        this.view.lookAt(this.lightPos, targetPos, this.cima);
        this.view.setPosition(this.lightPos);
        this.view.invert();

        // posição do alvo no espaço da luz; desloca x/y para o múltiplo de texel mais próximo
        this.alvoLuz.copy(targetPos).applyMatrix4(this.view);
        const t = this.texelMundo;
        const dx = Math.round(this.alvoLuz.x / t) * t - this.alvoLuz.x;
        const dy = Math.round(this.alvoLuz.y / t) * t - this.alvoLuz.y;
        this.snap.makeTranslation(dx, dy, 0);
        this.view.premultiply(this.snap);

        this.lightSpaceMatrix.multiplyMatrices(this.proj, this.view);
        this.uniforms.uLightSpaceMatrix.value.copy(this.lightSpaceMatrix);
    }

    dispose() { this.alvo.dispose(); this.alvo.depthTexture?.dispose(); this.materialProfundidade.dispose(); }
}