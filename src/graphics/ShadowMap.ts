// ShadowMap.ts — mapa de sombras direcional (ortográfico, caixa de 2 * RAIO_SOMBRA unidades em volta do alvo).
//
//  - resolução padrão 2048x2048 com caixa de 1200 unidades (mesma nitidez do original 4096 com caixa de 2400,
//    mas 4x menos pixels para desenhar e para amostrar);
//  - "texel snapping": a caixa da luz anda em passos de exatamente 1 texel, então a sombra não tremula quando o
//    carro se move;
//  - tudo é RELATIVO À ORIGEM DA SOMBRA (o alvo, arredondado para float32). Longe de (0,0,0) as matrizes com posições
//    absolutas perdem precisão em float32 e a sombra/iluminação pisca. As contas com números grandes são feitas
//    aqui, em dupla precisão, e só valores pequenos chegam ao shader.
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

    /** luz * vista relativa à origem: transforma (posição - origem) em coordenadas do mapa */
    readonly lightSpaceRel = new THREE.Matrix4();
    /** centro do mapa, arredondado para float32: o shader de profundidade subtrai exatamente este valor */
    readonly origem = new THREE.Vector3();

    private readonly proj = new THREE.Matrix4();
    private readonly view = new THREE.Matrix4();
    private readonly snap = new THREE.Matrix4();
    private readonly tmpT = new THREE.Matrix4();
    private readonly dir = new THREE.Vector3();
    private readonly lightPos = new THREE.Vector3();
    private readonly zero = new THREE.Vector3();
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
     * Prepara o desenho do mapa em torno de `targetPos` (chamar só quando for redesenhar o mapa).
     * A origem é o alvo em float32; o snapping alinha a grade de texels ao MUNDO (e não ao alvo), de modo que as
     * sombras fiquem paradas enquanto o carro anda.
     */
    atualizarMatriz(lightDir: THREE.Vector3, targetPos: THREE.Vector3) {
        const O = this.origem.set(Math.fround(targetPos.x), Math.fround(targetPos.y), Math.fround(targetPos.z));
        this.dir.copy(lightDir).normalize();

        // eixos x e y da luz (só rotação) e coordenadas ABSOLUTAS da origem nesses eixos, em dupla precisão
        this.view.lookAt(this.dir, this.zero, this.cima);
        const e = this.view.elements;
        const cx = e[0] * O.x + e[1] * O.y + e[2] * O.z;
        const cy = e[4] * O.x + e[5] * O.y + e[6] * O.z;
        const t = this.texelMundo;
        const sx = cx - Math.round(cx / t) * t;      // deslocamento (|s| <= t/2) que alinha a grade ao mundo
        const sy = cy - Math.round(cy / t) * t;

        // vista relativa à origem: a luz fica em dir * 1800 e olha para (0,0,0)
        this.lightPos.copy(this.dir).multiplyScalar(DISTANCIA_LUZ);
        this.view.lookAt(this.lightPos, this.zero, this.cima);
        this.view.setPosition(this.lightPos);
        this.view.invert();
        this.snap.makeTranslation(sx, sy, 0);
        this.view.premultiply(this.snap);

        this.lightSpaceRel.multiplyMatrices(this.proj, this.view);
        this.uniforms.uLightSpaceRel.value.copy(this.lightSpaceRel);
        this.uniforms.uOrigemSombra.value.copy(O);
    }

    /**
     * Passe principal: o shader só conhece posições relativas à câmera. Chamar todo frame (a câmera anda),
     * inclusive nos frames em que o mapa não foi redesenhado. cam - origem é uma subtração em dupla precisão.
     */
    atualizarParaCamera(cam: THREE.Vector3) {
        this.tmpT.makeTranslation(cam.x - this.origem.x, cam.y - this.origem.y, cam.z - this.origem.z);
        this.uniforms.uLightSpaceCam.value.multiplyMatrices(this.lightSpaceRel, this.tmpT);
    }

    dispose() { this.alvo.dispose(); this.alvo.depthTexture?.dispose(); this.materialProfundidade.dispose(); }
}