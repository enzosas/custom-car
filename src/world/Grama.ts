// Grama.ts — port de Grama.h: tufos de grama (3 cones inclinados) instanciados sobre o terreno.

import { GAME_CONFIG } from '@/core/config';
import { amostrarGrade, type Terreno, type AtributosChunk } from './Terreno';
import type { Estrada } from './Estrada';
import { Mt19937, uniformReal } from '@/core/Random';
import { AREA_REF, sementeChunk } from './Ruido';
import { Mat4, X_AXIS, Y_AXIS, Z_AXIS, type V3, radians } from '@/graphics/Mat4';
import type { Malha } from '@/graphics/Malha';

/** adicionarConeGeometria(): cone inclinado (tronco de cone) com rotação em X e Z */
function adicionarCone(pos: number[], col: number[], idx: number[], offsetBase: V3,
    raioChao: number, raioTopo: number, altura: number,
    incXDeg: number, incZDeg: number, segmentos: number, cor: number[]) {
    const step = 2 * Math.PI / segmentos;
    const rot = new Mat4().rotate(radians(incXDeg), X_AXIS).rotate(radians(incZDeg), Z_AXIS);

    const baseV: V3[] = [], topoV: V3[] = [];
    for (let i = 0; i < segmentos; ++i) {
        const ang = i * step, c = Math.cos(ang), s = Math.sin(ang);
        const b = rot.transform({ x: raioChao * c, y: 0, z: raioChao * s });
        const t = rot.transform({ x: raioTopo * c, y: altura, z: raioTopo * s });
        baseV.push({ x: offsetBase.x + b.x, y: offsetBase.y + b.y, z: offsetBase.z + b.z });
        topoV.push({ x: offsetBase.x + t.x, y: offsetBase.y + t.y, z: offsetBase.z + t.z });
    }

    let n = pos.length / 3;
    const v = (p: V3) => { pos.push(p.x, p.y, p.z); col.push(cor[0], cor[1], cor[2]); return n++; };

    for (let i = 0; i < segmentos; ++i) {
        const prox = (i + 1) % segmentos;
        const a = v(baseV[i]), b = v(baseV[prox]), c = v(topoV[prox]), d = v(topoV[i]);
        idx.push(a, b, c, a, c, d);

        const bc = v(offsetBase), b2 = v(baseV[prox]), b1 = v(baseV[i]);
        idx.push(bc, b2, b1);

        if (raioTopo > 0.0001) {
            const tc = rot.transform({ x: 0, y: altura, z: 0 });
            const t0 = v({ x: offsetBase.x + tc.x, y: offsetBase.y + tc.y, z: offsetBase.z + tc.z });
            const t1 = v(topoV[i]), t2 = v(topoV[prox]);
            idx.push(t0, t1, t2);
        }
    }
}

export function gerarGeometriaTufo(config = GAME_CONFIG): Malha {
    const g = config.grama.grama;
    const rTopoBase = g.raio, rChaoBase = rTopoBase * 0.8, altBase = g.altura, segs = g.segmentos;
    const corGrama = [1, 1, 1];   // branco: a cor de cada tufo vem da instância (a cor do terreno naquele ponto)
    const pos: number[] = [], col: number[] = [], idx: number[] = [];

    const distSep = rTopoBase * 2.4;
    const a1 = radians(0), a2 = radians(120), a3 = radians(240);
    const p1 = { x: distSep * Math.cos(a1), y: 0, z: distSep * Math.sin(a1) };
    const p2 = { x: distSep * Math.cos(a2), y: 0, z: distSep * Math.sin(a2) };
    const p3 = { x: distSep * Math.cos(a3), y: 0, z: distSep * Math.sin(a3) };

    adicionarCone(pos, col, idx, p1, rChaoBase, rTopoBase, altBase * 1.0, 0, 8, segs, corGrama);
    adicionarCone(pos, col, idx, p2, rChaoBase * 0.85, rTopoBase * 0.85, altBase * 0.80, -7, -4, segs, corGrama);
    adicionarCone(pos, col, idx, p3, rChaoBase * 0.75, rTopoBase * 0.75, altBase * 0.65, 7, -4, segs, corGrama);

    return { positions: new Float32Array(pos), colors: new Float32Array(col), indices: new Uint32Array(idx) };
}

interface DadosChunk {
    x: number; z: number;
    raio: number;
    n: number;
    posicoes: Float32Array;
    matrizes: Float32Array;
    cores: Float32Array;     // RGB de cada tufo (a cor do terreno sob ele)
}

/** Como a Floresta: os tufos nascem e somem junto com os chunks do terreno. */
export class Grama {
    quantidade = 0;
    private chunks = new Map<string, DadosChunk>();
    private seed = 1;

    constructor(private config = GAME_CONFIG) { }

    definirSeed(seed: number) { this.seed = seed >>> 0; this.limpar(); }

    limpar() { this.chunks.clear(); this.quantidade = 0; }

    remover(chave: string) {
        const d = this.chunks.get(chave);
        if (!d) return;
        this.quantidade -= d.n;
        this.chunks.delete(chave);
    }

    /** `quantidade` tufos por AREA_REF (mesma densidade do mapa antigo), sorteados com o RNG do chunk */
    adicionarChunk(chave: string, cx: number, cz: number, tam: number, terreno: Terreno, estrada?: Estrada, at?: AtributosChunk) {
        this.remover(chave);
        const x0 = cx * tam, z0 = cz * tam;
        const tentativas = Math.round(this.config.grama.grama.quantidade * (tam * tam) / AREA_REF);
        const rng = new Mt19937(sementeChunk(this.seed, cx, cz, 0x6a3d));

        const meiaLarguraPista = this.config.estrada.estrada.largura * 0.5;
        const distMinimaPista = meiaLarguraPista + this.config.grama.grama.distanciaEstrada;

        const pos: number[] = [], mats: number[] = [], cores: number[] = [];
        let count = 0;
        const esp = at ? tam / at.celulas : 1;
        const brilho = this.config.terreno.paleta.ativa ? 0.94 : 1;   // um pouco mais escuro que o chão, para o tufo aparecer

        for (let t = 0; t < tentativas; ++t) {
            const x = x0 + uniformReal(rng, 0, tam);
            const z = z0 + uniformReal(rng, 0, tam);

            if (Math.abs(x) < 25 && Math.abs(z) < 25) continue;
            if (estrada && estrada.distanciaEixo(x, z) < distMinimaPista) continue;

            // a paleta diz quanta grama o ponto aceita; a cor do tufo é a do terreno sob ele
            if (at) {
                const fator = amostrarGrade(at.veg, 2, 1, at.celulas, esp, cx, cz, x, z);
                if (fator < 1 && uniformReal(rng, 0, 1) > fator) continue;
                cores.push(amostrarGrade(at.cor, 3, 0, at.celulas, esp, cx, cz, x, z) * brilho,
                    amostrarGrade(at.cor, 3, 1, at.celulas, esp, cx, cz, x, z) * brilho,
                    amostrarGrade(at.cor, 3, 2, at.celulas, esp, cx, cz, x, z) * brilho);
            } else {
                cores.push(0.34, 0.7, 0.56);
            }

            const y = terreno.obterAlturaMundo(x, z) - 0.2;
            pos.push(x, y, z);

            const esc = uniformReal(rng, 0.85, 1.45);
            const rotY = uniformReal(rng, 0, 360);
            const m = new Mat4().translate({ x, y, z }).rotate(radians(rotY), Y_AXIS).scale({ x: esc, y: esc, z: esc });
            mats.push(...m.m);
            count++;
        }

        this.chunks.set(chave, {
            x: x0 + tam * 0.5, z: z0 + tam * 0.5, raio: tam * 0.7072, n: count,
            posicoes: new Float32Array(pos), matrizes: new Float32Array(mats), cores: new Float32Array(cores),
        });
        this.quantidade += count;
    }

    /** copia para `lote` as instâncias dentro do raio de visão; devolve a contagem */
    selecionar(pontoRef: V3, isShadowPass: boolean, lote: Float32Array, loteCor?: Float32Array): number {
        const alcance = isShadowPass ? 100 : 2000;
        const raioSq = alcance * alcance;
        let n = 0;
        for (const d of this.chunks.values()) {
            const cdx = d.x - pontoRef.x, cdz = d.z - pontoRef.z, lim = alcance + d.raio;
            if (cdx * cdx + cdz * cdz > lim * lim) continue;

            const P = d.posicoes, M = d.matrizes, K = d.cores;
            for (let i = 0; i < d.n; ++i) {
                const dx = P[i * 3] - pontoRef.x, dy = P[i * 3 + 1] - pontoRef.y, dz = P[i * 3 + 2] - pontoRef.z;
                if (dx * dx + dy * dy + dz * dz > raioSq) continue;
                lote.set(M.subarray(i * 16, i * 16 + 16), n * 16);
                if (loteCor) { loteCor[n * 3] = K[i * 3]; loteCor[n * 3 + 1] = K[i * 3 + 1]; loteCor[n * 3 + 2] = K[i * 3 + 2]; }
                n++;
            }
        }
        return n;
    }
}