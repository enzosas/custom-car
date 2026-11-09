// Ruido.ts   Perlin 2D com semente + ruído fractal (oitavas), usados pelo terreno e pela floresta.

import { Mt19937, shuffle } from '@/core/Random';

export class PerlinNoise2D {
    private p: number[];
    private static fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    private static lerp = (t: number, a: number, b: number) => a + t * (b - a);
    private static grad(hash: number, x: number, y: number) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    constructor(seed = 42) {
        const p = Array.from({ length: 256 }, (_, i) => i);
        shuffle(p, new Mt19937(seed));
        this.p = p.concat(p);
    }

    /** ruído normalizado em [0, 1] */
    noise(x: number, y: number): number {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = PerlinNoise2D.fade(x), v = PerlinNoise2D.fade(y);
        const p = this.p, L = PerlinNoise2D.lerp, G = PerlinNoise2D.grad;
        const A = p[X] + Y, B = p[X + 1] + Y;
        const res = L(v,
            L(u, G(p[A], x, y), G(p[B], x - 1, y)),
            L(u, G(p[A + 1], x, y - 1), G(p[B + 1], x - 1, y - 1)));
        return (res + 1) * 0.5;
    }
}

/**
 * Soma de `oitavas` camadas de Perlin (cada uma com o dobro da frequência e `persistencia` vezes a amplitude
 * da anterior), normalizada para [0, 1]. Cada oitava recebe um deslocamento próprio: o Perlin vale 0.5 em
 * todos os pontos da grade inteira, e sem o deslocamento essas posições se alinhariam entre as oitavas.
 */
export function ruidoFractal(perlin: PerlinNoise2D, x: number, z: number, oitavas: number, persistencia: number): number {
    let soma = 0, norma = 0, amp = 1, freq = 1;
    for (let o = 0; o < oitavas; ++o) {
        soma += amp * perlin.noise(x * freq + o * 17.13, z * freq + o * 91.71);
        norma += amp;
        amp *= persistencia;
        freq *= 2;
    }
    return norma > 0 ? soma / norma : 0.5;
}

/**
 * Ruído "ridged" em [0, 1]: as oitavas são dobradas em cristas (1 - |2n-1|) e elevadas ao quadrado, o que
 * dá linhas de picos e vales afiados em vez de colinas arredondadas. Usado para as montanhas.
 */
export function ruidoCristas(perlin: PerlinNoise2D, x: number, z: number, oitavas: number, persistencia: number): number {
    let soma = 0, norma = 0, amp = 1, freq = 1;
    for (let o = 0; o < oitavas; ++o) {
        const n = perlin.noise(x * freq + o * 17.13, z * freq + o * 91.71);
        const r = 1 - Math.abs(2 * n - 1);
        soma += amp * r * r;
        norma += amp;
        amp *= persistencia;
        freq *= 2;
    }
    return norma > 0 ? soma / norma : 0;
}

/** Área de referência das densidades de vegetação: `quantidade` vale para um quadrado de 20736 x 20736 (o mapa antigo). */
export const AREA_REF = 20736 * 20736;

/** Semente determinística do RNG de um chunk: depende da seed do mundo, do chunk e do tipo de objeto (`salt`). */
export function sementeChunk(seed: number, cx: number, cz: number, salt: number): number {
    let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(cx | 0, 0x85ebca6b) ^ Math.imul(cz | 0, 0xc2b2ae35) ^ salt;
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) || 1;
}
