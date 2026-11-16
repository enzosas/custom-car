// Malha.ts - formato de malha usado em todo o projeto + conversão para THREE.BufferGeometry.
import * as THREE from 'three';

/** `superficie` (opcional, só no terreno): 1 em cada vértice de asfalto, 0 no resto; vira o atributo aAsfalto do estilo PS2 */
/** `uvs` (opcional, 2 por vértice): usados pelos cartões de árvore do estilo PS2 */
export type Malha = { positions: Float32Array; colors: Float32Array; indices: Uint32Array; superficie?: Float32Array; uvs?: Float32Array; colorsPS2?: Float32Array; sup?: Float32Array };

export function geometriaDe(m: Malha): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    if (m.uvs) g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return g;
}
