// Floresta.ts — port de Floresta.h: distribuição das árvores (Perlin + rejeição pela pista) e seleção de LOD.

import { GAME_CONFIG } from './config';
import { Terreno } from './Terreno';
import { Estrada } from './Estrada';
import { Mt19937, uniformReal, shuffle } from './Random';
import { Mat4, X_AXIS, Y_AXIS, Z_AXIS, clamp, radians } from './Mat4';
import { NivelLOD } from './Arvore';

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
 * Prepara a medição de distância² até a linha central da pista (mesma conta de
 * distanciaMinimaEstradaSq do C++, mas com os segmentos pré-calculados em arrays tipados).
 */
export function criarDistanciaPista(curva: { x: number; z: number }[]): (x: number, z: number) => number {
    const count = curva.length;
    const ax = new Float64Array(count), az = new Float64Array(count);
    const abx = new Float64Array(count), abz = new Float64Array(count), inv = new Float64Array(count);
    const valido = new Uint8Array(count);
    for (let i = 0; i < count; ++i) {
        const a = curva[i], b = curva[(i + 1) % count];
        ax[i] = a.x; az[i] = a.z; abx[i] = b.x - a.x; abz[i] = b.z - a.z;
        const lenSq = abx[i] * abx[i] + abz[i] * abz[i];
        valido[i] = lenSq < 0.0001 ? 0 : 1;
        inv[i] = valido[i] ? 1 / lenSq : 0;
    }
    return (x: number, z: number) => {
        let menor = 1e30;
        if (count < 2) return menor;
        for (let i = 0; i < count; ++i) {
            if (!valido[i]) continue;
            const px = x - ax[i], pz = z - az[i];
            let t = (px * abx[i] + pz * abz[i]) * inv[i];
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = px - t * abx[i], dz = pz - t * abz[i];
            const d = dx * dx + dz * dz;
            if (d < menor) menor = d;
        }
        return menor;
    };
}

export class Floresta {
    /** posições (x,y,z) e matrizes 4x4 (coluna-maior) de cada árvore */
    posicoes = new Float32Array(0);
    matrizes = new Float32Array(0);
    quantidade = 0;

    constructor(private config = GAME_CONFIG) {}

    private calcularLOD(distSq: number): NivelLOD {
        if (distSq < 3000000) return NivelLOD.LOD_0_NORMAL;
        if (distSq < 17500000) return NivelLOD.LOD_1_TRES_SEGMENTOS;
        if (distSq < 37500000) return NivelLOD.LOD_2_CONE_UNICO;
        return NivelLOD.LOD_3_BILLBOARD;
    }

    gerarArvores(terreno: Terreno, estrada?: Estrada) {
        const pArvore = this.config.arvore.arvores;
        const qtdAlvo = pArvore.quantidade;
        const pos: number[] = [];
        const mats: number[] = [];

        const espacamento = this.config.terreno.parametros.espacamento * 0.005;
        const metadeTamanho = (256 * espacamento) * 0.45;

        const perlin = new PerlinNoise2D(1337);
        const rng = new Mt19937(42);

        const meiaLarguraPista = this.config.estrada.estrada.largura * 0.5;
        const distMinimaPista = meiaLarguraPista + pArvore.distanciaEstrada;
        const distMinimaPistaSq = distMinimaPista * distMinimaPista;
        const curva = estrada ? estrada.getPontosCurva() : null;
        const distPista = curva && curva.length > 0 ? criarDistanciaPista(curva) : null;

        const escalaRuido = 0.0035;
        const limiarClareira = 0.42;
        const maxTentativas = qtdAlvo * 12;
        let tentativas = 0;
        let count = 0;

        while (count < qtdAlvo && tentativas < maxTentativas) {
            tentativas++;
            const x = uniformReal(rng, -metadeTamanho, metadeTamanho);
            const z = uniformReal(rng, -metadeTamanho, metadeTamanho);

            if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
            if (distPista && distPista(x, z) < distMinimaPistaSq) continue;

            const densidade = perlin.noise(x * escalaRuido, z * escalaRuido);
            if (densidade < limiarClareira) continue;

            const chanceAceite = (densidade - limiarClareira) / (1 - limiarClareira);
            if (uniformReal(rng, 0, 1) > chanceAceite * chanceAceite) continue;

            const rotX = uniformReal(rng, -pArvore.inclinacaoRandMax, pArvore.inclinacaoRandMax);
            const rotY = uniformReal(rng, 0, pArvore.anguloRandMax);
            const rotZ = uniformReal(rng, -pArvore.inclinacaoRandMax, pArvore.inclinacaoRandMax);

            const sRaio = Math.max(0.2, 1 + uniformReal(rng, -pArvore.raioTroncoRand, pArvore.raioTroncoRand));
            const sAltura = Math.max(0.2, 1 + uniformReal(rng, -pArvore.alturaTroncoRand, pArvore.alturaTroncoRand));

            const yTerreno = terreno.obterAlturaMundo(x, z);
            const y = yTerreno - pArvore.afundamentoBase * sAltura;
            pos.push(x, y, z);

            const m = new Mat4()
                .translate({ x, y, z })
                .rotate(radians(rotY), Y_AXIS)
                .rotate(radians(rotX), X_AXIS)
                .rotate(radians(rotZ), Z_AXIS)
                .scale({ x: sRaio, y: sAltura, z: sRaio });
            mats.push(...m.m);
            count++;
        }
        this.quantidade = count;
        this.posicoes = new Float32Array(pos);
        this.matrizes = new Float32Array(mats);
    }

    /**
     * Distribui as árvores visíveis nos 4 lotes de LOD.
     * `lotes[k]` é um Float32Array de capacidade >= quantidade*16; devolve a contagem de cada lote.
     */
    selecionar(pontoRef: { x: number; y: number; z: number }, isShadowPass: boolean, lotes: Float32Array[]): number[] {
        const contagem = [0, 0, 0, 0];
        const raioSombraSq = 1350 * 1350;
        const raioVisaoSq = 750000000;
        const P = this.posicoes, M = this.matrizes;
        for (let i = 0; i < this.quantidade; ++i) {
            const dx = P[i * 3] - pontoRef.x, dy = P[i * 3 + 1] - pontoRef.y, dz = P[i * 3 + 2] - pontoRef.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (isShadowPass && distSq > raioSombraSq) continue;
            if (!isShadowPass && distSq > raioVisaoSq) continue;
            const k = this.calcularLOD(distSq);
            lotes[k].set(M.subarray(i * 16, i * 16 + 16), contagem[k] * 16);
            contagem[k]++;
        }
        return contagem;
    }
}
