// Malha.ts - formato de malha usado em todo o projeto + conversão para THREE.BufferGeometry.
import * as THREE from 'three';

export type Malha = { positions: Float32Array; colors: Float32Array; indices: Uint32Array };

export function geometriaDe(m: Malha): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return g;
}
