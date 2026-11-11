// materialPrincipal.ts   materiais do jogo (shader principal, rastro, profundidade, part culas).
import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { corSol, corCeu, corAmbiente } from './cor';
import {
    vertexPrincipal, fragmentPrincipal, vertexProfundidade, fragmentProfundidade,
    vertexParticula, fragmentParticula,
} from './shaders';

/** Uniforms compartilhados por todos os materiais que usam o shader principal */
export function criarUniformsCompartilhados() {
    const l = GAME_CONFIG.luz.parametros;
    return {
        uLightDir: { value: new THREE.Vector3(l.dirX, l.dirY, l.dirZ) },
        uLightColor: { value: new THREE.Vector3(...corSol(l)) },
        uAmbientColor: { value: new THREE.Vector3(...corAmbiente(l)) },
        uFogColor: { value: new THREE.Vector3(...corCeu(l)) },
        uNeblina: { value: l.neblina },
        uAmbient: { value: l.intensidadeAmbiente },
        uDiffuse: { value: l.intensidadeDifusa },
        uSpecular: { value: l.intensidadeEspecular },
        uShininess: { value: l.shininess },
        uShadowMap: { value: null as THREE.Texture | null },
        uShadowTexel: { value: new THREE.Vector2(1 / 4096, 1 / 4096) },
        uShadowOn: { value: 0 },
        // sombra RELATIVA (ver shaders.ts): longe da origem as matrizes absolutas perdem precisão em float32
        uLightSpaceCam: { value: new THREE.Matrix4() },   // passe principal: luz * translação(câmera - origem da sombra)
        uLightSpaceRel: { value: new THREE.Matrix4() },   // passe de profundidade: luz * vista, relativa à origem
        uOrigemSombra: { value: new THREE.Vector3() },    // origem da sombra (valor em float32)
    };
}

export type UniformsCompartilhados = ReturnType<typeof criarUniformsCompartilhados>;

export function atualizarLuz(u: UniformsCompartilhados) {
    const l = GAME_CONFIG.luz.parametros;
    u.uLightDir.value.set(l.dirX, l.dirY, l.dirZ);
    u.uLightColor.value.set(...corSol(l));
    u.uAmbientColor.value.set(...corAmbiente(l));
    u.uFogColor.value.set(...corCeu(l)); // neblina sempre na cor do céu
    u.uNeblina.value = l.neblina;
    u.uAmbient.value = l.intensidadeAmbiente;
    u.uDiffuse.value = l.intensidadeDifusa;
    u.uSpecular.value = l.intensidadeEspecular;
    u.uShininess.value = l.shininess;
}

export function criarMaterialPrincipal(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,            // atributo `color` (aColor no C++)
        side: THREE.DoubleSide,        // glDisable(GL_CULL_FACE)
        uniforms: { ...u, uAlpha: { value: 1.0 } },
    });
}

/**
 * Marcações da pista: mesmo shader do asfalto, mas puxadas na direção da câmera na profundidade (polygonOffset).
 * Só a folga geométrica não basta: com o plano próximo em 0.3 e o distante em 15000, o buffer de profundidade perde
 * resolução com a distância (a ~1000 unidades ele distingue só ~0.2) e as linhas piscariam contra o asfalto.
 */
export function criarMaterialMarcacao(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
        uniforms: { ...u, uAlpha: { value: 1.0 } },
    });
}

/** Rastro: mesmo shader, blending alfa, uAlpha = 0.40, sem escrita de profundidade */
export function criarMaterialRastro(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: { ...u, uAlpha: { value: 0.40 } },
    });
}

/** Passe de profundidade: glPolygonOffset(2, 4) */
export function criarMaterialProfundidade(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexProfundidade,
        fragmentShader: fragmentProfundidade,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 4,
        colorWrite: false,
        uniforms: { uLightSpaceRel: u.uLightSpaceRel, uOrigemSombra: u.uOrigemSombra },
    });
}

export function criarMaterialParticula(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexParticula,
        fragmentShader: fragmentParticula,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: u, // Partilha os mesmos uniforms de luz e ambiente
    });
}