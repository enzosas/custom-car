// Grama.ts — port de Grama.h: tufos de grama (3 cones inclinados) instanciados sobre o terreno.

import { GAME_CONFIG } from './config';
import { Terreno } from './Terreno';
import { Estrada } from './Estrada';
import { Mt19937, uniformReal } from './Random';
import { Mat4, X_AXIS, Y_AXIS, Z_AXIS, type V3, radians } from './Mat4';
import { criarDistanciaPista } from './Floresta';
import type { Malha } from './Veiculo';

/** adicionarConeGeometria(): cone inclinado (tronco de cone) com rotação em X e Z */
function adicionarCone(pos: number[], col: number[], idx: number[], offsetBase: V3,
                       raioChao: number, raioTopo: number, altura: number,
                       incXDeg: number, incZDeg: number, segmentos: number, cor: number[]) {
    const step = 2 * 3.14159265359 / segmentos;
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
    const corGrama = [0.34, 0.7, 0.56];
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

export class Grama {
    posicoes = new Float32Array(0);
    matrizes = new Float32Array(0);
    quantidade = 0;

    constructor(private config = GAME_CONFIG) {}

    gerarGrama(terreno: Terreno, estrada?: Estrada) {
        const qtdAlvo = this.config.grama.grama.quantidade;
        const pos: number[] = [], mats: number[] = [];

        const espacamento = this.config.terreno.parametros.espacamento * 0.005;
        const metadeTamanho = (256 * espacamento) * 0.45;
        const rng = new Mt19937(9999);

        const meiaLarguraPista = this.config.estrada.estrada.largura * 0.5;
        const distMinimaPista = meiaLarguraPista + this.config.grama.grama.distanciaEstrada;
        const distMinimaPistaSq = distMinimaPista * distMinimaPista;
        const curva = estrada ? estrada.getPontosCurva() : null;
        const distPista = curva && curva.length > 0 ? criarDistanciaPista(curva) : null;

        const maxTentativas = qtdAlvo * 6;
        let tentativas = 0, count = 0;

        while (count < qtdAlvo && tentativas < maxTentativas) {
            tentativas++;
            const x = uniformReal(rng, -metadeTamanho, metadeTamanho);
            const z = uniformReal(rng, -metadeTamanho, metadeTamanho);

            if (Math.abs(x) < 25 && Math.abs(z) < 25) continue;
            if (distPista && distPista(x, z) < distMinimaPistaSq) continue;

            const y = terreno.obterAlturaMundo(x, z) - 0.2;
            pos.push(x, y, z);

            const esc = uniformReal(rng, 0.85, 1.45);
            const rotY = uniformReal(rng, 0, 360);
            const m = new Mat4().translate({ x, y, z }).rotate(radians(rotY), Y_AXIS).scale({ x: esc, y: esc, z: esc });
            mats.push(...m.m);
            count++;
        }
        this.quantidade = count;
        this.posicoes = new Float32Array(pos);
        this.matrizes = new Float32Array(mats);
    }

    /** copia para `lote` as instâncias dentro do raio de visão; devolve a contagem */
    selecionar(pontoRef: V3, isShadowPass: boolean, lote: Float32Array): number {
        const raioSq = isShadowPass ? 100 * 100 : 2000 * 2000;
        const P = this.posicoes, M = this.matrizes;
        let n = 0;
        for (let i = 0; i < this.quantidade; ++i) {
            const dx = P[i * 3] - pontoRef.x, dy = P[i * 3 + 1] - pontoRef.y, dz = P[i * 3 + 2] - pontoRef.z;
            if (dx * dx + dy * dy + dz * dz > raioSq) continue;
            lote.set(M.subarray(i * 16, i * 16 + 16), n * 16);
            n++;
        }
        return n;
    }
}
