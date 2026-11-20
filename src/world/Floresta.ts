// Floresta.ts — port de Floresta.h: distribuição das árvores (Perlin + rejeição pela pista) e seleção de LOD.

import { GAME_CONFIG } from '@/core/config';
import { amostrarGrade, type Terreno, type AtributosChunk } from './Terreno';
import type { Estrada } from './Estrada';
import { Mt19937, uniformReal } from '@/core/Random';
import { PerlinNoise2D, AREA_REF, sementeChunk } from './Ruido';
import { Mat4, X_AXIS, Y_AXIS, Z_AXIS, radians } from '@/graphics/Mat4';
import { NivelLOD } from './Arvore';

interface DadosChunk {
    x: number; z: number;      // centro do chunk
    raio: number;              // meia diagonal (para descartar o chunk inteiro de uma vez na seleção)
    n: number;
    posicoes: Float32Array;    // x,y,z de cada árvore
    matrizes: Float32Array;    // matriz 4x4 (coluna-maior) de cada árvore
}

/** As árvores moram nos chunks do terreno: nascem quando o chunk é carregado e somem quando ele é descartado. */
export class Floresta {
    quantidade = 0;
    private chunks = new Map<string, DadosChunk>();
    private seed = 1;
    private perlin = new PerlinNoise2D(1337);

    constructor(private config = GAME_CONFIG) { }

    /** a seed do mundo muda onde ficam as clareiras e o sorteio de cada chunk */
    definirSeed(seed: number) {
        this.seed = seed >>> 0;
        this.perlin = new PerlinNoise2D(((seed ^ 0x5bd1e995) >>> 0) || 1337);
        this.limpar();
    }

    limpar() { this.chunks.clear(); this.quantidade = 0; }

    remover(chave: string) {
        const d = this.chunks.get(chave);
        if (!d) return;
        this.quantidade -= d.n;
        this.chunks.delete(chave);
    }

    /** limites de LOD da config, ao quadrado e sempre em ordem crescente (um valor menor que o anterior vira o anterior) */
    private limitesLOD() {
        const l = this.config.arvore.lod;
        const d1 = Math.max(0, l.lod1), d2 = Math.max(d1, l.lod2), d3 = Math.max(d2, l.lod3), max = Math.max(0, l.maxima);
        return { l1: d1 * d1, l2: d2 * d2, l3: d3 * d3, max: max * max };
    }

    private calcularLOD(distSq: number, lim: { l1: number; l2: number; l3: number }): NivelLOD {
        if (distSq < lim.l1) return NivelLOD.LOD_0_NORMAL;
        if (distSq < lim.l2) return NivelLOD.LOD_1_TRES_SEGMENTOS;
        if (distSq < lim.l3) return NivelLOD.LOD_2_CONE_UNICO;
        return NivelLOD.LOD_3_BILLBOARD;
    }

    /**
     * Sorteia as árvores do chunk (cx, cz) de lado `tam`. Cada chunk tem o seu RNG, derivado da seed do mundo,
     * então o resultado não depende da ordem em que os chunks são carregados e é sempre o mesmo para um chunk.
     * A densidade é a mesma do mapa antigo: `quantidade` árvores por AREA_REF (12 tentativas por árvore, com a
     * aceitação do ruído de clareiras, que na média fica em ~6,5%).
     */
    adicionarChunk(chave: string, cx: number, cz: number, tam: number, terreno: Terreno, estrada?: Estrada, at?: AtributosChunk) {
        this.remover(chave);
        const pArvore = this.config.arvore.arvores;
        const x0 = cx * tam, z0 = cz * tam;
        const tentativas = Math.round(pArvore.quantidade * 12 * (tam * tam) / AREA_REF);
        const rng = new Mt19937(sementeChunk(this.seed, cx, cz, 0x7a11));

        const meiaLarguraPista = this.config.estrada.estrada.largura * 0.5;
        const distMinimaPista = meiaLarguraPista + pArvore.distanciaEstrada;

        const escalaRuido = 0.035;       // 1/m: tamanho das clareiras
        const limiarClareira = 0.42;
        const pos: number[] = [];
        const mats: number[] = [];
        let count = 0;

        for (let t = 0; t < tentativas; ++t) {
            // sorteia em coordenadas locais ao chunk e soma a origem em dupla precisão
            const x = x0 + uniformReal(rng, 0, tam);
            const z = z0 + uniformReal(rng, 0, tam);

            if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;

            // primeiro os testes baratos (o das clareiras rejeita ~93% dos sorteios); a consulta à pista fica por último
            const densidade = this.perlin.noise(x * escalaRuido, z * escalaRuido);
            if (densidade < limiarClareira) continue;

            const chanceAceite = (densidade - limiarClareira) / (1 - limiarClareira);
            // a paleta diz quanto de árvore o ponto aceita (nada no deserto, na rocha e na neve); sem sorteio extra
            const fator = at ? amostrarGrade(at.veg, 2, 0, at.celulas, tam / at.celulas, cx, cz, x, z) : 1;
            if (uniformReal(rng, 0, 1) > chanceAceite * chanceAceite * fator) continue;

            if (estrada && estrada.distanciaEixo(x, z) < distMinimaPista) continue;

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

        this.chunks.set(chave, {
            x: x0 + tam * 0.5, z: z0 + tam * 0.5, raio: tam * 0.7072, n: count,
            posicoes: new Float32Array(pos), matrizes: new Float32Array(mats),
        });
        this.quantidade += count;
    }

    /**
     * Distribui as árvores visíveis nos 4 lotes de LOD.
     * `lotes[k]` é um Float32Array de capacidade >= quantidade*16; devolve a contagem de cada lote.
     */
    selecionar(pontoRef: { x: number; y: number; z: number }, isShadowPass: boolean, lotes: Float32Array[]): number[] {
        const contagem = [0, 0, 0, 0];
        // árvores que entram no mapa de sombra: até um pouco além da diagonal da caixa da sombra
        const raioSombra = Math.max(135, (this.config.opcoes.alcanceSombra ?? 60) * 1.5);
        const raioSombraSq = raioSombra * raioSombra;
        const limites = this.limitesLOD();
        const raioVisaoSq = limites.max;
        const alcance = Math.sqrt(isShadowPass ? raioSombraSq : raioVisaoSq);
        for (const d of this.chunks.values()) {
            // chunk inteiro fora do alcance: nem olha as árvores dele
            const cdx = d.x - pontoRef.x, cdz = d.z - pontoRef.z, lim = alcance + d.raio;
            if (cdx * cdx + cdz * cdz > lim * lim) continue;

            const P = d.posicoes, M = d.matrizes;
            for (let i = 0; i < d.n; ++i) {
                const dx = P[i * 3] - pontoRef.x, dy = P[i * 3 + 1] - pontoRef.y, dz = P[i * 3 + 2] - pontoRef.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (isShadowPass && distSq > raioSombraSq) continue;
                if (!isShadowPass && distSq > raioVisaoSq) continue;
                const k = this.calcularLOD(distSq, limites);
                lotes[k].set(M.subarray(i * 16, i * 16 + 16), contagem[k] * 16);
                contagem[k]++;
            }
        }
        return contagem;
    }
}