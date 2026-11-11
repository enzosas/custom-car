// Ceu.ts — domo do céu (gradiente, sol, estrelas) e nuvens low poly.
//
// O domo é uma esfera unitária centrada na câmera, desenhada no fundo (profundidade máxima), então nunca é cortada
// pelo plano distante. As nuvens são instâncias de um aglomerado de poucos triângulos, desenhadas com o MESMO shader
// do terreno (iluminação, sombra do sol e neblina), e giram em volta da câmera como num mundo infinito: a posição de
// cada nuvem é calculada relativa à câmera (em dupla precisão no JS), então não há perda de precisão longe da origem.
import * as THREE from 'three';
import type { GAME_CONFIG } from '@/core/config';
import { criarMaterialCeu, type UniformsCompartilhados } from './materialPrincipal';
import type { Atmosfera } from './Atmosfera';

type CfgCeu = typeof GAME_CONFIG.ceu.parametros;

const MAX_NUVENS = 400;

/** hash inteiro -> [0, 1): sorteio por nuvem, sempre o mesmo para o mesmo índice */
function sorteio(i: number, k: number): number {
    let h = (Math.imul(i + 1, 374761393) + Math.imul(k + 1, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** aglomerado de ~6 blobs achatados (icosaedros de 20 faces); mais escuro embaixo, claro em cima */
function criarGeometriaNuvem(): THREE.BufferGeometry {
    const blobs: number[][] = [   // x, y, z, raio x, raio y, raio z
        [0.00, 0.00, 0.00, 1.00, 0.55, 0.90],
        [0.95, -0.06, 0.20, 0.75, 0.45, 0.70],
        [-0.90, -0.08, -0.10, 0.80, 0.48, 0.75],
        [0.20, 0.12, -0.75, 0.70, 0.50, 0.65],
        [-0.25, 0.10, 0.80, 0.65, 0.45, 0.60],
        [0.30, 0.42, 0.10, 0.60, 0.45, 0.60],
    ];
    const pos: number[] = [], cor: number[] = [];
    const ico = new THREE.IcosahedronGeometry(1, 0).toNonIndexed().getAttribute('position');
    for (const [bx, by, bz, rx, ry, rz] of blobs) {
        for (let i = 0; i < ico.count; ++i) {
            const x = bx + ico.getX(i) * rx, y = by + ico.getY(i) * ry, z = bz + ico.getZ(i) * rz;
            pos.push(x, y, z);
            const claro = 0.78 + 0.22 * Math.min(1, Math.max(0, (y + 0.45) / 1.0));
            cor.push(claro, claro, claro);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cor), 3));
    return geo;
}

export class Ceu {
    private readonly grupo = new THREE.Group();
    private readonly domo: THREE.Mesh;
    private readonly materialCeu: THREE.ShaderMaterial;
    private readonly nuvens: THREE.InstancedMesh;
    /** por nuvem: x, z (fração do lado), altura, escala x, escala z, giro, 0, 0 */
    private readonly sorteios = new Float32Array(MAX_NUVENS * 8);
    private tempo = 0;

    constructor(private scene: THREE.Scene, uniforms: UniformsCompartilhados, materialNuvem: THREE.ShaderMaterial) {
        this.materialCeu = criarMaterialCeu(uniforms);
        this.domo = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), this.materialCeu);
        this.domo.frustumCulled = false;
        this.domo.renderOrder = -1000;                 // desenhado primeiro; o terreno e o resto cobrem
        this.grupo.add(this.domo);

        this.nuvens = new THREE.InstancedMesh(criarGeometriaNuvem(), materialNuvem, MAX_NUVENS);
        this.nuvens.frustumCulled = false;
        this.nuvens.count = 0;
        this.nuvens.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.grupo.add(this.nuvens);

        for (let i = 0; i < MAX_NUVENS; ++i) {
            const o = i * 8;
            this.sorteios[o] = sorteio(i, 0); this.sorteios[o + 1] = sorteio(i, 1); this.sorteios[o + 2] = sorteio(i, 2);
            this.sorteios[o + 3] = 0.7 + 1.0 * sorteio(i, 3); this.sorteios[o + 4] = 0.8 + 0.5 * sorteio(i, 4);
            this.sorteios[o + 5] = sorteio(i, 5) * Math.PI * 2;
        }
        scene.add(this.grupo);
    }

    /** o passe de profundidade da sombra não deve desenhar o céu nem as nuvens */
    setVisivel(v: boolean) { this.grupo.visible = v; }

    atualizar(dt: number, cam: THREE.Vector3, atm: Atmosfera, c: CfgCeu) {
        this.tempo += dt;
        const u = this.materialCeu.uniforms;
        u.uZenith.value.set(atm.corZenite[0], atm.corZenite[1], atm.corZenite[2]);
        u.uSunColor.value.set(atm.corBrilhoSol[0], atm.corBrilhoSol[1], atm.corBrilhoSol[2]);
        u.uSunSize.value = c.solTamanho;
        u.uSunBright.value = c.solBrilho;
        u.uNight.value = c.estrelas ? atm.noite : 0;

        const n = c.nuvens ? Math.max(0, Math.min(MAX_NUVENS, Math.floor(c.nuvensQuantidade))) : 0;
        this.nuvens.count = n;
        this.nuvens.visible = n > 0;
        if (n === 0) return;

        // o grupo fica na câmera; as nuvens são posicionadas relativas a ela (e dão a volta no mundo ao sair do raio)
        this.grupo.position.copy(cam);
        const R = Math.max(1000, c.nuvensRaio), P = 2 * R;
        const dir = c.nuvensDirecao * Math.PI / 180;
        const vx = Math.cos(dir) * c.nuvensVelocidade * this.tempo, vz = Math.sin(dir) * c.nuvensVelocidade * this.tempo;
        const esc = Math.max(0.05, c.nuvensEscala) * 500;
        const arr = this.nuvens.instanceMatrix.array as Float32Array;
        for (let i = 0; i < n; ++i) {
            const s = i * 8, o = i * 16;
            let rx = (this.sorteios[s] * P + vx - cam.x) % P; if (rx < 0) rx += P; rx -= R;
            let rz = (this.sorteios[s + 1] * P + vz - cam.z) % P; if (rz < 0) rz += P; rz -= R;
            const y = c.nuvensAltura + (this.sorteios[s + 2] - 0.5) * 600 - cam.y;
            const sx = esc * this.sorteios[s + 3], sz = sx * this.sorteios[s + 4], sy = sx * 0.45;
            const cs = Math.cos(this.sorteios[s + 5]), sn = Math.sin(this.sorteios[s + 5]);
            arr[o] = cs * sx; arr[o + 1] = 0; arr[o + 2] = -sn * sx; arr[o + 3] = 0;
            arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
            arr[o + 8] = sn * sz; arr[o + 9] = 0; arr[o + 10] = cs * sz; arr[o + 11] = 0;
            arr[o + 12] = rx; arr[o + 13] = y; arr[o + 14] = rz; arr[o + 15] = 1;
        }
        this.nuvens.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this.grupo);
        this.domo.geometry.dispose();
        this.nuvens.geometry.dispose();
        this.nuvens.dispose();
        this.materialCeu.dispose();
    }
}