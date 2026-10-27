// Arvore.ts — port de Arvore.h: geometria das árvores em 4 níveis de detalhe (LOD).
// Devolve apenas malhas (positions/colors/indices); o desenho instanciado é feito em Jogo.ts.

import { GAME_CONFIG } from './config';
import { radians } from './Mat4';
import type { Malha } from './Veiculo';

export enum NivelLOD { LOD_0_NORMAL = 0, LOD_1_TRES_SEGMENTOS = 1, LOD_2_CONE_UNICO = 2, LOD_3_BILLBOARD = 3 }

export interface GeometriasArvore {
    lod0: Malha[];      // tronco + 3 copas (segmentosTronco lados)
    lod1: Malha[];      // tronco + 3 copas (3 lados)
    lod2: Malha[];      // cone único de 4 lados
    lod3: Malha[];      // billboard cruzado
    alturaTotal: number;
}

/** gerarConeDeslocado(): tronco ou copa cônica truncada com deslocamento vertical e rotação angular */
function gerarConeDeslocado(raioBase: number, raioTopo: number, altura: number, yOffset: number,
                            segmentos: number, cor: number[], rotacaoYDeg = 0): Malha {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const step = 2 * 3.14159265359 / segmentos;
    const rotRad = radians(rotacaoYDeg);
    let n = 0;
    const v = (x: number, y: number, z: number) => { pos.push(x, y, z); col.push(cor[0], cor[1], cor[2]); return n++; };

    for (let i = 0; i < segmentos; ++i) {
        const a1 = i * step + rotRad, a2 = (i + 1) * step + rotRad;
        const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);

        const b1 = v(raioBase * c1, yOffset, raioBase * s1);
        const b2 = v(raioBase * c2, yOffset, raioBase * s2);
        const t2 = v(raioTopo * c2, yOffset + altura, raioTopo * s2);
        const t1 = v(raioTopo * c1, yOffset + altura, raioTopo * s1);
        idx.push(b1, b2, t2, b1, t2, t1);

        // tampa inferior
        const bc = v(0, yOffset, 0);
        const bb2 = v(raioBase * c2, yOffset, raioBase * s2);
        const bb1 = v(raioBase * c1, yOffset, raioBase * s1);
        idx.push(bc, bb2, bb1);
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(col), indices: new Uint32Array(idx) };
}

function gerarBillboardCone(raioBase: number, altTotal: number, cor: number[]): Malha {
    const p = [
        -raioBase, 0, 0, raioBase, 0, 0, 0, altTotal, 0,
        0, 0, -raioBase, 0, 0, raioBase, 0, altTotal, 0,
    ];
    const c: number[] = [];
    for (let i = 0; i < 6; ++i) c.push(cor[0], cor[1], cor[2]);
    return { positions: new Float32Array(p), colors: new Float32Array(c), indices: new Uint32Array([0, 1, 2, 3, 4, 5]) };
}

export function gerarGeometriasArvore(config = GAME_CONFIG): GeometriasArvore {
    const a = config.arvore.arvores;
    const alturaTronco = a.alturaTronco * 0.1;
    const raioTroncoBase = a.raioTronco * 0.2;
    const raioTroncoTopo = raioTroncoBase * 0.45;
    const segLOD0 = a.segmentosTronco;

    const raioCopa1 = raioTroncoBase * 4.5, alturaCopa1 = alturaTronco * 0.65;
    const raioCopa2 = raioCopa1 * 0.8, alturaCopa2 = alturaTronco * 0.6;
    const raioCopa3 = raioCopa1 * 0.6, alturaCopa3 = alturaTronco * 0.55;

    const yC1 = alturaTronco * 0.60;
    const yC2 = yC1 + alturaTronco * 0.35;
    const yC3 = yC2 + alturaTronco * 0.35;
    const alturaTotal = yC3 + alturaCopa3;

    const corMadeira = [0.68, 0.57, 0.48];
    const corFolhagem = [0.34, 0.7, 0.56];

    const montar = (seg: number): Malha[] => [
        gerarConeDeslocado(raioTroncoBase, raioTroncoTopo, alturaTronco, 0, seg, corMadeira, 0),
        gerarConeDeslocado(raioCopa1, 0, alturaCopa1, yC1, seg, corFolhagem, 0),
        gerarConeDeslocado(raioCopa2, 0, alturaCopa2, yC2, seg, corFolhagem, 22),
        gerarConeDeslocado(raioCopa3, 0, alturaCopa3, yC3, seg, corFolhagem, 45),
    ];

    return {
        lod0: montar(segLOD0),
        lod1: montar(3),
        lod2: [gerarConeDeslocado(raioCopa1, 0, alturaTotal, 0, 4, corFolhagem, 0)],
        lod3: [gerarBillboardCone(raioCopa1, alturaTotal, corFolhagem)],
        alturaTotal,
    };
}
