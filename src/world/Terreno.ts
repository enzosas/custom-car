// Terreno.ts
// Terreno infinito: a altura é uma FUNÇÃO de (x, z) (ruído fractal com semente), sem heightmap em arquivo.
// O mundo é dividido em chunks quadrados de `celulasPorChunk` células; este arquivo só sabe calcular a altura
// em qualquer ponto e preencher os vértices de um chunk (quem cria/descarta as malhas é o WorldBuilder).
// A física e o visual usam a mesma função, então sempre concordam.

import { GAME_CONFIG } from '@/core/config';
import { PerlinNoise2D, ruidoFractal, ruidoCristas } from './Ruido';
import type { Estrada } from './Estrada';
import { avaliarPaleta, COR_GRAMA_PADRAO, type SaidaPaleta } from './Paleta';

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

const CONTRASTE_BIOMA = 2.4;       // o ruído de bioma fica concentrado perto de 0.5; abre a faixa para usar 0..1
const ESCALA_MANCHAS = 700;        // tamanho das manchas de variação de cor (unidades)

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const suave = (a: number, b: number, x: number) => { const t = limitar((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** atributos por vértice da grade de um chunk: cor e cobertura vegetal (calculados por Terreno.preencherAtributosChunk) */
export interface AtributosChunk {
    celulas: number;
    /** RGB de cada um dos (celulas+1)² vértices */
    cor: Float32Array;
    /** por vértice: [quanto de árvore, quanto de grama] o ponto aceita (0..1) */
    veg: Float32Array;
}

/**
 * Valor interpolado de um atributo por vértice (`canais` valores por vértice) no ponto de mundo (x, z), nos MESMOS
 * triângulos da malha: (i0,i2,i1) e (i1,i2,i3), como obterAlturaMundo.
 */
export function amostrarGrade(dados: Float32Array, canais: number, canal: number, celulas: number, esp: number,
    cx: number, cz: number, x: number, z: number): number {
    const n = celulas + 1;
    const gx = limitar((x - cx * celulas * esp) / esp, 0, celulas - 1e-6);
    const gz = limitar((z - cz * celulas * esp) / esp, 0, celulas - 1e-6);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const v = (a: number, b: number) => dados[((j + b) * n + (i + a)) * canais + canal];
    if (fx + fz < 1) return v(0, 0) + fx * (v(1, 0) - v(0, 0)) + fz * (v(0, 1) - v(0, 0));
    return v(1, 1) + (1 - fx) * (v(0, 1) - v(1, 1)) + (1 - fz) * (v(1, 0) - v(1, 1));
}

/** hash inteiro 2D -> [-1, 1] (variação de cor por vértice, sempre a mesma para o mesmo vértice global) */
function hash2(a: number, b: number): number {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295 * 2 - 1;
}

interface ParamRelevo {
    fColinas: number; fRegiao: number; fCristas: number;
    oitavas: number; persistencia: number; escala: number;
}

export class Terreno {
    private perlin = new PerlinNoise2D(1);
    private alturasTmp = new Float32Array(0);        // alturas do chunk com 1 vértice de folga em volta (inclinação sem emenda)
    private paletaTmp: SaidaPaleta = { r: 0, g: 0, b: 0, arvore: 1, grama: 1, neve: 0, rocha: 0, deserto: 0, outono: 0 };
    /** a pista que molda o terreno (definida pelo WorldBuilder); sem ela o terreno é só o relevo */
    estrada: Estrada | null = null;

    constructor(private config = GAME_CONFIG) { }

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

    /** bioma em (x, z): 0..1, ruído de baixa frequência (ver Paleta.ts) */
    biomaEm(x: number, z: number): number {
        const f = 1 / Math.max(1000, this.config.terreno.paleta.escalaBioma);
        return limitar((ruidoFractal(this.perlin, x * f + 900, z * f + 900, 2, 0.5) - 0.5) * CONTRASTE_BIOMA + 0.5, 0, 1);
    }

    /** manchas grandes de variação de cor em (x, z), em [-1.2, 1.2] */
    private manchaEm(x: number, z: number): number {
        return (ruidoFractal(this.perlin, x / ESCALA_MANCHAS + 300, z / ESCALA_MANCHAS + 300, 2, 0.5) - 0.5) * 2.4;
    }

    /**
     * Cor do solo e pesos de superfície (neve, rocha, deserto, outono) em um ponto qualquer do mundo, com a MESMA
     * paleta que pinta os vértices (altitude, inclinação e bioma). Mais caro que biomaEm: faz 5 leituras de altura.
     * Serve às partículas do carro, que não rodam todo frame (ver EfeitosDrift). `s` é preenchido e reaproveitado.
     */
    superficieEm(x: number, z: number, s: SaidaPaleta) {
        const p = this.config.terreno.paleta;
        if (!p.ativa) { avaliarPaleta(p, 0, 0, 0, 0, s); return; }
        const q = this.lerParametros(), esp = this.espacamento;
        const hc = this.obterAlturaMundo(x, z);
        const hx = (this.alturaVertice(x + esp, z, q) - this.alturaVertice(x - esp, z, q)) / (2 * esp);
        const hz = (this.alturaVertice(x, z + esp, q) - this.alturaVertice(x, z - esp, q)) / (2 * esp);
        const ruido = limitar(0.65 * this.manchaEm(x, z) + 0.35 * hash2(Math.round(x / esp), Math.round(z / esp)), -1, 1);
        avaliarPaleta(p, this.biomaEm(x, z), limitar(hc / q.escala, 0, 1), Math.hypot(hx, hz), ruido, s);
    }

    criarAtributosChunk(): AtributosChunk {
        const celulas = this.celulasPorChunk, n = celulas + 1;
        return { celulas, cor: new Float32Array(n * n * 3), veg: new Float32Array(n * n * 2) };
    }

    /**
     * Cor e cobertura vegetal de cada vértice do chunk (cx, cz), a partir da altitude, da inclinação e do bioma.
     * `pos` são os vértices já preenchidos por preencherChunk. A inclinação de um vértice usa os vizinhos, inclusive
     * os do chunk ao lado (calculados aqui pela função de altura), então a cor não tem emenda entre chunks.
     */
    preencherAtributosChunk(cx: number, cz: number, pos: Float32Array, at: AtributosChunk) {
        const p = this.config.terreno.paleta;
        const celulas = at.celulas, n = celulas + 1, esp = this.espacamento;
        const s = this.paletaTmp;

        if (!p.ativa) {
            for (let k = 0; k < n * n; ++k) {
                at.cor[k * 3] = COR_GRAMA_PADRAO[0]; at.cor[k * 3 + 1] = COR_GRAMA_PADRAO[1]; at.cor[k * 3 + 2] = COR_GRAMA_PADRAO[2];
                at.veg[k * 2] = 1; at.veg[k * 2 + 1] = 1;
            }
            return;
        }

        const q = this.lerParametros();
        const m = n + 2;
        if (this.alturasTmp.length < m * m) this.alturasTmp = new Float32Array(m * m);
        const H = this.alturasTmp;
        for (let j = -1; j <= n; ++j) {
            for (let i = -1; i <= n; ++i) {
                H[(j + 1) * m + (i + 1)] = (i >= 0 && i < n && j >= 0 && j < n)
                    ? pos[(j * n + i) * 3 + 1]
                    : this.alturaVertice((cx * celulas + i) * esp, (cz * celulas + j) * esp, q);
            }
        }

        for (let j = 0; j < n; ++j) {
            for (let i = 0; i < n; ++i) {
                const gi = cx * celulas + i, gj = cz * celulas + j;
                const gx = gi * esp, gz = gj * esp;
                const hc = H[(j + 1) * m + (i + 1)];
                const hx = (H[(j + 1) * m + (i + 2)] - H[(j + 1) * m + i]) / (2 * esp);
                const hz = (H[(j + 2) * m + (i + 1)] - H[j * m + (i + 1)]) / (2 * esp);
                const incl = Math.hypot(hx, hz);
                const alt = limitar(hc / q.escala, 0, 1);

                // variação de cor: manchas grandes (ruído suave) misturadas com um granulado por vértice
                const ruido = limitar(0.65 * this.manchaEm(gx, gz) + 0.35 * hash2(gi, gj), -1, 1);

                avaliarPaleta(p, this.biomaEm(gx, gz), alt, incl, ruido, s);
                const k = j * n + i;
                at.cor[k * 3] = s.r; at.cor[k * 3 + 1] = s.g; at.cor[k * 3 + 2] = s.b;
                at.veg[k * 2] = s.arvore; at.veg[k * 2 + 1] = s.grama;
            }
        }
    }

    /**
     * Amostrador de altura com a MESMA superfície de obterAlturaMundo, mas que guarda a altura de cada vértice da grade
     * (o cache vive só enquanto o amostrador existe). Serve para quem lê muitos pontos vizinhos, como as marcações da
     * pista: cada vértice é calculado uma vez, em vez de três por amostra (e cada cálculo consulta a pista).
     */
    criarAmostradorAltura(): (xMundo: number, zMundo: number) => number {
        const q = this.lerParametros();
        const esp = this.espacamento;
        const cache = new Map<number, number>();
        const h = (a: number, b: number) => {
            const k = (a + 4194304) * 8388608 + (b + 4194304);      // índices globais da grade, deslocados para ficarem positivos
            let v = cache.get(k);
            if (v === undefined) { v = this.alturaVertice(a * esp, b * esp, q); cache.set(k, v); }
            return v;
        };
        return (xMundo, zMundo) => {
            const gx = xMundo / esp, gz = zMundo / esp;
            const i = Math.floor(gx), j = Math.floor(gz);
            const fx = gx - i, fz = gz - j;
            const h00 = h(i, j), h10 = h(i + 1, j), h01 = h(i, j + 1);
            if (fx + fz < 1) return h00 + fx * (h10 - h00) + fz * (h01 - h00);
            const h11 = h(i + 1, j + 1);
            return h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
        };
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