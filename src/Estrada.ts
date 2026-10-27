// Estrada.ts — port de Estrada.h (pista procedural em spline Catmull-Rom).
// A malha é devolvida como arrays tipados; quem desenha é o Jogo.ts.

import { GAME_CONFIG } from './config';
import { Terreno, type Vec3 } from './Terreno';
import { Mt19937, uniformReal, sementeAleatoria } from './Random';
import { clamp, smoothstep, mix } from './Mat4';

export interface MalhaPista {
    positions: Float32Array;
    colors: Float32Array;
    indices: Uint32Array;
}

const CATMULL = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 => {
    const t2 = t * t, t3 = t2 * t;
    const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
    return { x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y), z: c(p0.z, p1.z, p2.z, p3.z) };
};

export class Estrada {
    pontosControle: Vec3[] = [];
    pontosCurva: Vec3[] = [];

    constructor(private config = GAME_CONFIG) {}

    getPontosCurva() { return this.pontosCurva; }
    getPontosControle() { return this.pontosControle; }

    /** média móvel circular das cotas y (suavizarAlturas) */
    private suavizarAlturas(janela: number) {
        const n = this.pontosCurva.length;
        if (n === 0 || janela <= 0) return;
        const ys = new Array<number>(n);
        for (let i = 0; i < n; ++i) {
            let soma = 0;
            for (let k = -janela; k <= janela; ++k) soma += this.pontosCurva[(((i + k) % n) + n) % n].y;
            ys[i] = soma / (2 * janela + 1);
        }
        for (let i = 0; i < n; ++i) this.pontosCurva[i].y = ys[i];
    }

    /** gerar(): restaura o relevo, sorteia pontos de controle, interpola, aplaina o terreno e extruda o asfalto */
    gerar(terreno: Terreno, seed = 0): MalhaPista | null {
        if (!terreno) return null;
        terreno.restaurarOriginal();

        const params = this.config.estrada.estrada;
        const numPontos = Math.max(6, params.quantidadePontosControle);

        if (seed === 0) seed = sementeAleatoria();
        const rng = new Mt19937(seed);

        const espacamento = this.config.terreno.parametros.espacamento * 0.005;
        const metadeTamanho = (256 * espacamento) * 0.45;
        const raioMedio = metadeTamanho * params.raioBase;
        const amplitudeRuido = raioMedio * params.quantidadeRuido;

        this.pontosControle = [];
        const PI = 3.14159265359;
        const passoAngular = (2 * PI) / numPontos;

        for (let i = 0; i < numPontos; ++i) {
            // ordem das chamadas ao RNG igual ao C++: primeiro o deslocamento angular, depois o ruído radial
            const angulo = (i * passoAngular) + (uniformReal(rng, -0.25, 0.25) * passoAngular);
            const r = Math.max(50, raioMedio + uniformReal(rng, -amplitudeRuido, amplitudeRuido));
            const x = r * Math.cos(angulo);
            const z = r * Math.sin(angulo);
            const y = terreno.obterAlturaMundo(x, z);
            this.pontosControle.push({ x, y, z });
        }

        this.pontosCurva = [];
        const passosPorSegmento = 25;
        const total = this.pontosControle.length;
        for (let i = 0; i < total; ++i) {
            const i0 = (i - 1 + total) % total, i1 = i, i2 = (i + 1) % total, i3 = (i + 2) % total;
            for (let s = 0; s < passosPorSegmento; ++s) {
                const t = s / passosPorSegmento;
                const p = CATMULL(this.pontosControle[i0], this.pontosControle[i1], this.pontosControle[i2], this.pontosControle[i3], t);
                p.y = terreno.obterAlturaMundo(p.x, p.z);
                this.pontosCurva.push(p);
            }
        }

        this.suavizarAlturas(8);

        const meiaLargura = params.largura * 0.5;
        terreno.aplainarSobreCaminho(this.pontosCurva, meiaLargura, espacamento * 1.5, espacamento * 6.0, params.offsetElevacao);

        // extrusão da fita de asfalto
        const n = this.pontosCurva.length;
        const positions = new Float32Array(n * 2 * 3);
        const colors = new Float32Array(n * 2 * 3);
        const indices: number[] = [];
        const corAsfalto = [0.25, 0.25, 0.28];

        for (let i = 0; i < n; ++i) {
            const iAnt = (i - 1 + n) % n, iProx = (i + 1) % n;
            const a = this.pontosCurva[iAnt], b = this.pontosCurva[iProx], c = this.pontosCurva[i];
            let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            let l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
            // lateral = normalize(cross(dir, up(0,1,0)))
            let lx = dy * 0 - dz * 1, lz = dx * 1 - dy * 0; // cross(dir,(0,1,0)) = (-dz, 0, dx)
            lx = -dz; lz = dx;
            l = Math.hypot(lx, 0, lz) || 1; lx /= l; lz /= l;

            const k = i * 6;
            positions[k] = c.x - lx * meiaLargura; positions[k + 1] = c.y; positions[k + 2] = c.z - lz * meiaLargura;
            positions[k + 3] = c.x + lx * meiaLargura; positions[k + 4] = c.y; positions[k + 5] = c.z + lz * meiaLargura;
            for (let q = 0; q < 2; ++q) { colors[k + q * 3] = corAsfalto[0]; colors[k + q * 3 + 1] = corAsfalto[1]; colors[k + q * 3 + 2] = corAsfalto[2]; }

            if (i > 0) {
                const b0 = (i - 1) * 2;
                indices.push(b0, b0 + 1, b0 + 3);
                indices.push(b0, b0 + 3, b0 + 2);
            }
        }
        const ultimoPar = (n - 1) * 2;
        indices.push(ultimoPar, ultimoPar + 1, 1);
        indices.push(ultimoPar, 1, 0);

        return { positions, colors, indices: new Uint32Array(indices) };
    }

    /** menor distância (plano xz) até a linha central, com a cota y interpolada */
    private projetar(x: number, z: number): { d: number; y: number } {
        const n = this.pontosCurva.length;
        let melhorD = 1e30, y = 0;
        for (let i = 0; i < n; ++i) {
            const a = this.pontosCurva[i], b = this.pontosCurva[(i + 1) % n];
            const abx = b.x - a.x, abz = b.z - a.z;
            const len2 = abx * abx + abz * abz;
            const t = len2 > 0 ? clamp(((x - a.x) * abx + (z - a.z) * abz) / len2, 0, 1) : 0;
            const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
            if (d < melhorD) { melhorD = d; y = a.y + (b.y - a.y) * t; }
        }
        return { d: melhorD, y };
    }

    /** obterAlturaSuperficie(): mistura suave entre asfalto e relevo nas bordas */
    obterAlturaSuperficie(x: number, z: number, terreno: Terreno): number {
        const hTerreno = terreno.obterAlturaMundo(x, z);
        if (this.pontosCurva.length < 2) return hTerreno;
        const meiaLargura = this.config.estrada.estrada.largura * 0.5;
        const { d, y } = this.projetar(x, z);
        const w = 1 - smoothstep(meiaLargura - 0.2, meiaLargura + 0.2, d);
        return mix(hTerreno, y, w);
    }

    /** estaNoAsfalto(): dentro da meia largura + 0.5 */
    estaNoAsfalto(x: number, z: number): boolean {
        if (this.pontosCurva.length < 2) return false;
        const meiaLargura = this.config.estrada.estrada.largura * 0.5;
        return this.projetar(x, z).d <= meiaLargura + 0.5;
    }
}
