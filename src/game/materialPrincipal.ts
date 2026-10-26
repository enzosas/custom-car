// game/materialPrincipal.ts
import * as THREE from 'three';
import { GAME_CONFIG } from '../config';
import { vertexPrincipal, fragmentPrincipal } from './shaders';

export function criarMaterialPrincipal(): THREE.ShaderMaterial {
    const l = GAME_CONFIG.luz.parametros;
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,       // expõe o atributo `color` (aColor no C++)
        side: THREE.DoubleSide,   // glDisable(GL_CULL_FACE)
        uniforms: {
            uLightDir: { value: new THREE.Vector3(l.dirX, l.dirY, l.dirZ) },
            uLightColor: { value: new THREE.Vector3(l.corR, l.corG, l.corB) },
            uAlpha: { value: 1.0 },
            uAmbient: { value: l.intensidadeAmbiente },
            uDiffuse: { value: l.intensidadeDifusa },
            uSpecular: { value: l.intensidadeEspecular },
            uShininess: { value: l.shininess },
        },
    });
}
