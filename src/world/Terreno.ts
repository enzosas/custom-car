// Terreno.ts
// Terreno infinito: a altura é uma FUNÇÃO de (x, z) (ruído fractal com semente), sem heightmap em arquivo.
// O mundo é dividido em chunks quadrados de `celulasPorChunk` células; este arquivo só sabe calcular a altura
// em qualquer ponto e preencher os vértices de um chunk (quem cria/descarta as malhas é o WorldBuilder).
// A física e o visual usam a mesma função, então sempre concordam.

import { GAME_CONFIG } from '@/core/config';
import { PerlinNoise2D, ruidoFractal, ruidoCristas } from './Ruido';
import type { Estrada } from './Estrada';

export type Vec3 = { x: number; y: number; z: number };

// O relevo combina três camadas, todas em [0, 1]:
//   colinas : fractal suave (o "morro" local, comprimentoOnda)
//   regiao  : ruído de escala enorme (comprimentoRegiao) que separa planícies baixas de terras altas
//   cristas : ruído "ridged" (picos afiados), que só aparece nas regiões altas e forma as montanhas
// Os valores abaixo foram medidos: ~55% do mapa fica em planícies/vales, ~26% em morros e ~16% em
// montanhas, com 99% da área abaixo de 0.27 de inclinação.
const CONTRASTE_COLINAS = 2.2;   // o fractal fica concentrado perto de 0.5; abre a faixa para usar 0..1
const CONTRASTE_REGIAO = 2.4;
const NIVEL_BASE = 0.06;         // altura das planícies mais baixas
const NIVEL_REGIAO = 0.30;       // quanto as terras altas sobem acima disso
const RELEVO_MIN = 0.20;         // amplitude dos morros nas planícies...
const RELEVO_REGIAO = 0.16;      // ...e quanto ela cresce nas terras altas
const MONTANHA_INICIO = 0.45;    // a partir de que "altitude regional" as cristas começam a aparecer
const MONTANHA_PLENA = 0.80;
const GANHO_CRISTAS = 1.8;
const FORCA_MONTANHA = 0.71;     // altura das cristas
const COMPRIMENTO_REGIAO = 23030; // tamanho das regiões (planície x terras altas)
const JOELHO = 0.78;             // acima disso o relevo satura suavemente (sem topos achatados)

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const suave = (a: number, b: number, x: number) => { const t = limitar((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

interface ParamRelevo {
    fColinas: number; fRegiao: number; fCristas: number;
    oitavas: number; persistencia: number; escala: number;
}

export class Terreno {
    private perlin = new PerlinNoise2D(1);
    /** a pista que molda o terreno (definida pelo WorldBuilder); sem ela o terreno é só o relevo */
    estrada: Estrada | null = null;

    constructor(private config = GAME_CONFIG) {}

    definirSeed(seed: number) { this.perlin = new PerlinNoise2D((seed >>> 0) || 1); }

    /** distância entre vértices vizinhos (unidades do mundo) */
    get espacamento() { return this.config.terreno.parametros.espacamento * 0.005; }
    /** altura máxima do relevo */
    get escalaOndulacao() { return this.config.terreno.parametros.ondulacao * 0.05; }
    get celulasPorChunk() { return limitar(Math.floor(this.config.terreno.parametros.celulasPorChunk), 4, 250); }
    get tamanhoChunk() { return this.celulasPorChunk * this.espacamento; }
    /** quantos chunks existem em volta do carro em cada direção */
    get raioChunks() { return limitar(Math.floor(this.config.terreno.parametros.raioChunks), 1, 12); }

    private lerParametros(): ParamRelevo {
        const p = this.config.terreno.parametros;
        const comp = Math.max(10, p.comprimentoOnda);
        return {
            fColinas: 1 / comp,
            fCristas: 1 / (comp * 0.7),
            fRegiao: 1 / COMPRIMENTO_REGIAO,
            oitavas: limitar(Math.floor(p.oitavas), 1, 8),
            persistencia: p.persistencia,
            escala: this.escalaOndulacao,
        };
    }

    /** altura normalizada (0..1) em (x, z) */
    private alturaNormalizada(x: number, z: number, q: ParamRelevo): number {
        const colinas = limitar((ruidoFractal(this.perlin, x * q.fColinas, z * q.fColinas, q.oitavas, q.persistencia) - 0.5) * CONTRASTE_COLINAS + 0.5, 0, 1);
        const regiao = limitar((ruidoFractal(this.perlin, x * q.fRegiao + 500, z * q.fRegiao + 500, 2, 0.5) - 0.5) * CONTRASTE_REGIAO + 0.5, 0, 1);

        let h = NIVEL_BASE + NIVEL_REGIAO * regiao + (colinas - 0.5) * (RELEVO_MIN + RELEVO_REGIAO * regiao);

        const mascara = suave(MONTANHA_INICIO, MONTANHA_PLENA, regiao);
        if (mascara > 0) {
            const cristas = limitar(ruidoCristas(this.perlin, x * q.fCristas + 300, z * q.fCristas + 300, q.oitavas, 0.5) * GANHO_CRISTAS, 0, 1);
            h += cristas * mascara * FORCA_MONTANHA;
        }

        if (h > JOELHO) h = JOELHO + (1 - JOELHO) * Math.tanh((h - JOELHO) / (1 - JOELHO));
        return limitar(h, 0, 1);
    }

    /** relevo natural (sem a pista) em (x, z): função contínua */
    alturaRelevo(x: number, z: number): number {
        const q = this.lerParametros();
        return this.alturaNormalizada(x, z, q) * q.escala;
    }

    /**
     * Altura no VÉRTICE da grade em (x, z): o relevo, nivelado na cota da pista perto dela. Até `raioPlano` da linha
     * central a cota é exatamente a da pista; dali até `raioTotal` ela vai se misturando de volta ao relevo.
     */
    private alturaVertice(x: number, z: number, q: ParamRelevo): number {
        const h = this.alturaNormalizada(x, z, q) * q.escala;
        const e = this.estrada;
        if (e && e.consultarCota(x, z)) {
            const w = 1 - suave(e.raioPlano, e.raioTotal, e.resD);
            if (w > 0) return h + (e.resY - h) * w;
        }
        return h;
    }

    /**
     * Altura do terreno em coordenadas de mundo, EXATAMENTE a da malha desenhada.
     * A malha é feita de triângulos entre vértices que ficam a `espacamento` um do outro; entre os vértices a
     * superfície é uma rampa reta. Se a física lesse a função contínua do ruído, ela divergiria dessas rampas
     * (o carro flutuaria ou afundaria, mais ainda com triângulos grandes). Por isso amostramos a função só nos
     * vértices da célula e interpolamos nos mesmos triângulos que gerarIndices() desenha:
     * (i0,i2,i1) e (i1,i2,i3), com a diagonal indo de (x+1, z) a (x, z+1).
     * Como o asfalto é recortado desses mesmos triângulos, o carro nunca muda de plano ao entrar na pista.
     */
    obterAlturaMundo(xMundo: number, zMundo: number): number {
        const q = this.lerParametros();
        const esp = this.espacamento;
        const gx = xMundo / esp, gz = zMundo / esp;
        const i = Math.floor(gx), j = Math.floor(gz);
        const fx = gx - i, fz = gz - j;
        const h = (a: number, b: number) => this.alturaVertice(a * esp, b * esp, q);

        const h00 = h(i, j), h10 = h(i + 1, j), h01 = h(i, j + 1);
        if (fx + fz < 1) return h00 + fx * (h10 - h00) + fz * (h01 - h00);
        const h11 = h(i + 1, j + 1);
        return h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
    }

    /**
     * Escreve em `out` os vértices (x, y, z) do chunk (cx, cz) em coordenadas LOCAIS ao chunk (o mesh é
     * posicionado em cx*tamanhoChunk, cz*tamanhoChunk). Isso mantém os floats pequenos longe da origem.
     * A altura é calculada a partir do índice global da célula (inteiro * espacamento), então dois chunks
     * vizinhos calculam exatamente a mesma altura na borda e não surgem frestas.
     */
    preencherChunk(cx: number, cz: number, out: Float32Array) {
        const q = this.lerParametros();
        const esp = this.espacamento, celulas = this.celulasPorChunk;
        const n = celulas + 1;
        let k = 0;
        for (let j = 0; j < n; ++j) {
            const wz = (cz * celulas + j) * esp;
            for (let i = 0; i < n; ++i) {
                const wx = (cx * celulas + i) * esp;
                out[k++] = i * esp;
                out[k++] = this.alturaVertice(wx, wz, q);
                out[k++] = j * esp;
            }
        }
    }

    /** Índices de um chunk: (i0,i2,i1) e (i1,i2,i3) por célula. A topologia é igual para todos os chunks. */
    gerarIndices(): Uint32Array {
        const W = this.celulasPorChunk + 1, D = W;
        const idx = new Uint32Array((W - 1) * (D - 1) * 6);
        let k = 0;
        for (let z = 0; z < D - 1; ++z) {
            for (let x = 0; x < W - 1; ++x) {
                const i0 = z * W + x, i1 = z * W + x + 1;
                const i2 = (z + 1) * W + x, i3 = (z + 1) * W + x + 1;
                idx[k++] = i0; idx[k++] = i2; idx[k++] = i1;
                idx[k++] = i1; idx[k++] = i2; idx[k++] = i3;
            }
        }
        return idx;
    }
}
