// Estrada.ts   pista INFINITA.
//
// A linha central é gerada de forma determinística pela seed, em passos de PASSO unidades, nos dois sentidos a partir
// da origem, e só até onde o carro precisa. O rumo em cada ponto é  anguloCurva * g(s / comprimentoCurva)  em relação
// ao eixo +z, com g um ruído suave em [-1, 1]. Como o desvio nunca passa de 85° (< 90°), a pista SEMPRE avança em z:
// nunca se cruza nem volta sobre si mesma, e z cresce de forma estritamente monotônica ao longo dela. Isso permite
// achar os segmentos perto de um ponto com uma busca binária em z, sem estrutura espacial.
//
// O terreno é derivado da pista (Terreno.alturaVertice): em volta da linha central ele é nivelado na cota da pista.
// Nos chunks que a pista atravessa, a malha do terreno é refeita (gerarMalhaTerrenoChunk): os triângulos da grade que
// a pista toca são trocados por pedaços de grama e de asfalto, no mesmo plano, na MESMA malha, com vértices exatamente
// onde a borda do asfalto cruza as arestas da grade (compartilhados pelos dois lados). Não há nada por baixo do
// asfalto, então não há z-fighting nem degrau, e a física lê só a função de altura do terreno.

import { GAME_CONFIG } from '@/core/config';
import type { Terreno, Vec3 } from './Terreno';
import { PerlinNoise2D } from './Ruido';
import type { Malha } from '@/graphics/Malha';

/** distância entre pontos consecutivos da linha central */
export const PASSO = 40;
/** meia janela (em pontos) de cada uma das duas passadas de média que suavizam a cota da pista */
const JANELA = 15;
/** pontos gerados por vez ao estender a pista */
const POR_LOTE = 32;
/** teto do desvio de rumo; abaixo de 90° para garantir que a pista sempre avança em z */
const MAX_ANGULO = 85;
const MAX_PONTOS = 600000;
/** cor do asfalto (a do terreno vem da paleta: ver Terreno.preencherAtributosChunk) */
const COR_ASFALTO = [0.25, 0.25, 0.28];
/** cor das marcações (linhas brancas) e a folga delas acima do asfalto */
const COR_MARCACAO = [0.95, 0.95, 0.95];
const ELEVACAO_MARCACAO = 0.12;
/** distância máxima entre as seções de uma fita: para ela acompanhar as quebras entre os triângulos do terreno */
const PASSO_FITA = 10;
/** distância aproximada entre os pontos que seguem a curva da borda do asfalto dentro de um triângulo */
const ESPACO_BORDA = 25;
/** quanto além da menor distância um trecho da pista ainda pesa na cota do terreno (ver consultarCota) */
const FOLGA_COTA = 200;

interface Pt { x: number; z: number; yr: number; y1: number; y: number }

export interface Projecao {
    /** índice do segmento (entre o ponto i e o i+1) e posição t ∈ [0,1] nele */
    i: number; t: number;
    /** distância até a linha central */
    d: number;
    /** ponto projetado na linha central e direção (unitária, no plano xz) do sentido +z da pista */
    x: number; y: number; z: number; dirX: number; dirZ: number;
}

/**
 * Triangula um polígono simples (côncavo ou não) por "ear clipping". Os vértices colineares (os pontos de corte sobre
 * as arestas da grade) NUNCA são removidos: viram vértices de triângulos, para não restar nenhuma T-junction.
 * Devolve índices de três em três. Se travar (geometria degenerada), cai para um leque a partir do primeiro vértice.
 */
function triangularPoligono(xs: number[], zs: number[]): number[] {
    const m = xs.length;
    if (m < 3) return [];
    let area2 = 0;
    for (let i = 0; i < m; ++i) area2 += xs[i] * zs[(i + 1) % m] - xs[(i + 1) % m] * zs[i];
    const v: number[] = [];
    for (let i = 0; i < m; ++i) v.push(area2 > 0 ? i : m - 1 - i);          // sempre anti-horário
    const cruz = (a: number, b: number, c: number) => (xs[b] - xs[a]) * (zs[c] - zs[a]) - (zs[b] - zs[a]) * (xs[c] - xs[a]);
    const out: number[] = [];
    const EPS = 1e-6;
    let guarda = 0;
    while (v.length > 3 && ++guarda < 10000) {
        let achou = false;
        for (let p = 0; p < v.length && !achou; ++p) {
            const a = v[(p + v.length - 1) % v.length], b = v[p], c = v[(p + 1) % v.length];
            if (cruz(a, b, c) <= EPS) continue;                              // reflexo ou colinear: não é orelha
            let livre = true;
            for (const q of v) {
                if (q === a || q === b || q === c) continue;
                if (cruz(a, b, q) >= -EPS && cruz(b, c, q) >= -EPS && cruz(c, a, q) >= -EPS) { livre = false; break; }
            }
            if (!livre) continue;
            out.push(a, b, c);
            v.splice(p, 1);
            achou = true;
        }
        if (!achou) {
            for (let q = 1; q < v.length - 1; ++q) out.push(v[0], v[q], v[q + 1]);
            return out;
        }
    }
    if (v.length === 3) out.push(v[0], v[1], v[2]);
    return out;
}

export class Estrada {
    private fw: Pt[] = [];      // índices 0, 1, 2, ...
    private bw: Pt[] = [];      // índices -1, -2, ... (bw[0] é o índice -1)
    private p1 = { a: 0, b: -1 };   // faixa de índices com y1 (1ª média) calculado
    private pf = { a: 0, b: -1 };   // faixa de índices com y final calculado (os únicos usáveis)

    private seed = 1;
    private ruido = new PerlinNoise2D(1);
    private anguloMax = 0;
    private comp = 1800;
    private hw = 40;
    private rp = 0;             // raio do platô (nivelado)
    private rt = 0;             // raio total (platô + transição)

    /** resultado da última consulta() / consultarCota() bem-sucedida */
    resD = 0; resY = 0; resT = 0; resI = 0;
    private tmpD = new Float64Array(512);
    private tmpT = new Float64Array(512);

    constructor(private terreno: Terreno, private config = GAME_CONFIG) { this.reiniciar(1); }

    get raioPlano() { return this.rp; }
    get raioTotal() { return this.rt; }
    get meiaLargura() { return this.hw; }
    /** primeiro e último índice de ponto com cota final (segmentos válidos: de faixaMin a faixaMax-1) */
    get faixaMin() { return this.pf.a; }
    get faixaMax() { return this.pf.b; }

    /** descarta a pista e a recria do zero com a seed (e os parâmetros atuais do config); o terreno precisa já ter a mesma seed */
    reiniciar(seed: number = this.seed) {
        this.seed = (seed >>> 0) || 1;
        const c = this.config.estrada.estrada;
        this.anguloMax = Math.min(Math.max(c.anguloCurva, 0), MAX_ANGULO) * Math.PI / 180;
        this.comp = Math.max(100, c.comprimentoCurva);
        this.hw = c.largura * 0.5;
        this.rp = this.hw + 1.5 * this.terreno.espacamento;   // 1.5 célula: todo vértice de um triângulo que toca o asfalto fica no platô
        this.rt = this.rp + Math.max(1, c.larguraTransicao);
        this.ruido = new PerlinNoise2D((((this.seed ^ 0x2545f491) >>> 0)) || 1);
        this.fw = []; this.bw = [];
        this.p1 = { a: 0, b: -1 }; this.pf = { a: 0, b: -1 };
        this.fw.push(this.novoPt(0, 0));
    }

    private novoPt(x: number, z: number): Pt {
        return { x, z, yr: this.terreno.alturaRelevo(x, z), y1: 0, y: 0 };
    }

    private pt(i: number): Pt { return i >= 0 ? this.fw[i] : this.bw[-i - 1]; }
    private get lo() { return -this.bw.length; }
    private get hi() { return this.fw.length - 1; }

    /** desvio de rumo (rad) em relação a +z na posição s (comprimento de arco) da pista */
    private rumo(s: number): number {
        const u = s / this.comp;
        const n1 = this.ruido.noise(u + 13.7, 0.37);
        const n2 = this.ruido.noise(u * 2.3 + 91.2, 5.11);
        return this.anguloMax * Math.tanh(4.2 * ((n1 - 0.5) * 0.8 + (n2 - 0.5) * 0.2));
    }

    private estender(lado: 1 | -1, n: number) {
        for (let c = 0; c < n; ++c) {
            if (lado > 0) {
                const k = this.fw.length - 1;                 // segmento k liga o ponto k ao k+1
                const a = this.fw[k], f = this.rumo((k + 0.5) * PASSO);
                this.fw.push(this.novoPt(a.x + PASSO * Math.sin(f), a.z + PASSO * Math.cos(f)));
            } else {
                const m = -this.bw.length;                    // menor índice atual
                const a = this.pt(m), f = this.rumo((m - 1 + 0.5) * PASSO);
                this.bw.push(this.novoPt(a.x - PASSO * Math.sin(f), a.z - PASSO * Math.cos(f)));
            }
        }
    }

    /** média móvel de `src` em ±JANELA gravada em `dest`, só para os índices ainda não calculados de [novoA, novoB] */
    private calcular(dest: 'y1' | 'y', src: 'yr' | 'y1', r: { a: number; b: number }, novoA: number, novoB: number) {
        if (novoB < novoA) return;
        const media = (i: number) => {
            let s = 0;
            for (let j = i - JANELA; j <= i + JANELA; ++j) s += this.pt(j)[src];
            return s / (2 * JANELA + 1);
        };
        if (r.b < r.a) {
            for (let i = novoA; i <= novoB; ++i) this.pt(i)[dest] = media(i);
            r.a = novoA; r.b = novoB;
            return;
        }
        for (let i = novoA; i < r.a; ++i) this.pt(i)[dest] = media(i);
        for (let i = r.b + 1; i <= novoB; ++i) this.pt(i)[dest] = media(i);
        r.a = Math.min(r.a, novoA); r.b = Math.max(r.b, novoB);
    }

    /**
     * Cota final = duas médias móveis seguidas da cota do relevo ao longo da pista (rampas suaves). Cada média só
     * existe onde a janela inteira já foi gerada, então a cota de um ponto nunca muda depois de calculada e não
     * depende de até onde a pista foi estendida.
     */
    private finalizar() {
        this.calcular('y1', 'yr', this.p1, this.lo + JANELA, this.hi - JANELA);
        this.calcular('y', 'y1', this.pf, this.lo + 2 * JANELA, this.hi - 2 * JANELA);
    }

    /** estende a pista (nos dois sentidos) até a parte com cota final cobrir toda a faixa z ∈ [zMin, zMax] */
    garantirCobertura(zMin: number, zMax: number) {
        let guarda = 0;
        while ((this.pf.b < this.pf.a || this.pt(this.pf.b).z < zMax) && this.fw.length < MAX_PONTOS && ++guarda < 100000) {
            this.estender(1, POR_LOTE); this.finalizar();
        }
        guarda = 0;
        while ((this.pf.b < this.pf.a || this.pt(this.pf.a).z > zMin) && this.bw.length < MAX_PONTOS && ++guarda < 100000) {
            this.estender(-1, POR_LOTE); this.finalizar();
        }
    }

    /** maior índice de ponto com z <= `z` (lo-1 se todos estiverem acima); z cresce com o índice */
    private indiceDeZ(z: number): number {
        let a = this.lo, b = this.hi;
        if (this.pt(a).z > z) return a - 1;
        while (a < b) {
            const m = (a + b + 1) >> 1;
            if (this.pt(m).z <= z) a = m; else b = m - 1;
        }
        return a;
    }

    /**
     * Segmento mais próximo de (x, z) dentro de `raio`. Se existe, devolve true e deixa o resultado em
     * resD (distância), resY (cota da linha central no ponto projetado), resI/resT (segmento e posição nele).
     */
    consultar(x: number, z: number, raio = this.rt): boolean {
        if (this.pf.b <= this.pf.a) return false;
        let k0 = this.indiceDeZ(z - raio - PASSO), k1 = this.indiceDeZ(z + raio + PASSO) + 1;
        if (k0 < this.pf.a) k0 = this.pf.a;
        if (k1 > this.pf.b - 1) k1 = this.pf.b - 1;
        if (k1 < k0) return false;

        let melhor = Infinity, bi = k0, bt = 0;
        let a = this.pt(k0);
        for (let k = k0; k <= k1; ++k) {
            const b = this.pt(k + 1);
            const abx = b.x - a.x, abz = b.z - a.z;
            let t = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
            const d2 = dx * dx + dz * dz;
            if (d2 < melhor) { melhor = d2; bi = k; bt = t; }
            a = b;
        }
        if (melhor > raio * raio) return false;
        const p = this.pt(bi), q = this.pt(bi + 1);
        this.resD = Math.sqrt(melhor); this.resI = bi; this.resT = bt;
        this.resY = p.y + (q.y - p.y) * bt;
        return true;
    }

    /**
     * Como consultar(), mas a cota (resY) é uma média ponderada CONTÍNUA das cotas de todos os trechos da pista
     * que estão quase tão perto quanto o mais próximo (peso cai a zero a `FOLGA_COTA` além da menor distância).
     * Com "o mais próximo" a cota dá um salto onde dois trechos distantes da pista empatam (lado interno de curvas
     * fechadas); com a média ela varia de forma contínua. A distância (resD) continua sendo a menor.
     * É a consulta que o terreno usa para se nivelar na pista.
     */
    consultarCota(x: number, z: number): boolean {
        if (this.pf.b <= this.pf.a) return false;
        const raio = this.rt, folga = FOLGA_COTA;
        let k0 = this.indiceDeZ(z - raio - folga - PASSO), k1 = this.indiceDeZ(z + raio + folga + PASSO) + 1;
        if (k0 < this.pf.a) k0 = this.pf.a;
        if (k1 > this.pf.b - 1) k1 = this.pf.b - 1;
        if (k1 < k0) return false;
        const n = k1 - k0 + 1;
        if (this.tmpD.length < n) { this.tmpD = new Float64Array(n * 2); this.tmpT = new Float64Array(n * 2); }
        const D = this.tmpD, T = this.tmpT;

        let melhor = Infinity;
        let a = this.pt(k0);
        for (let k = k0; k <= k1; ++k) {
            const b = this.pt(k + 1);
            const abx = b.x - a.x, abz = b.z - a.z;
            let t = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
            const d2 = dx * dx + dz * dz;
            D[k - k0] = d2; T[k - k0] = t;
            if (d2 < melhor) melhor = d2;
            a = b;
        }
        if (melhor > raio * raio) return false;

        const dmin = Math.sqrt(melhor), lim = (dmin + folga) * (dmin + folga);
        let somaW = 0, somaWY = 0;
        for (let k = k0; k <= k1; ++k) {
            const d2 = D[k - k0];
            if (d2 >= lim) continue;
            const u = 1 - (Math.sqrt(d2) - dmin) / folga;
            const w = u * u;
            const p = this.pt(k), q = this.pt(k + 1);
            somaW += w; somaWY += w * (p.y + (q.y - p.y) * T[k - k0]);
        }
        this.resD = dmin;
        this.resY = somaWY / somaW;
        return true;
    }

    /** distância até a linha central (Infinity se estiver além do raio total) */
    distanciaEixo(x: number, z: number): number {
        return this.consultar(x, z) ? this.resD : Infinity;
    }

    /** dentro da meia largura (+0,5, como no jogo original) */
    estaNoAsfalto(x: number, z: number): boolean {
        return this.consultar(x, z, this.hw + 1) && this.resD <= this.hw + 0.5;
    }

    /** ponto mais próximo na linha central, em qualquer distância (amplia a busca até achar) */
    projetar(x: number, z: number): Projecao | null {
        for (let raio = Math.max(this.rt, 1000); raio <= 4e6; raio *= 2) {
            this.garantirCobertura(z - raio - 2 * PASSO, z + raio + 2 * PASSO);
            if (!this.consultar(x, z, raio)) continue;
            const i = this.resI, t = this.resT;
            const a = this.pt(i), b = this.pt(i + 1);
            const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
            return { i, t, d: this.resD, x: a.x + dx * t, y: this.resY, z: a.z + dz * t, dirX: dx / l, dirZ: dz / l };
        }
        return null;
    }

    /** pontos (com cota final) dos índices i0..i1, limitados ao trecho já finalizado; `inicio` é o índice do primeiro */
    janela(i0: number, i1: number): { inicio: number; pontos: Vec3[] } {
        const a = Math.max(i0, this.pf.a), b = Math.min(i1, this.pf.b);
        const pontos: Vec3[] = [];
        for (let i = a; i <= b; ++i) { const p = this.pt(i); pontos.push({ x: p.x, y: p.y, z: p.z }); }
        return { inicio: a, pontos };
    }

    /**
     * Marcações da pista do chunk (cx, cz): duas linhas brancas contínuas nas laterais e uma tracejada no centro, como
     * fitas finas deitadas sobre o asfalto. É uma malha SEPARADA da do terreno (as do asfalto são triângulos grandes
     * com cor chapada por vértice, que não desenham uma linha de ~1 unidade).
     *
     * - A posição vem da linha central: cada ponto tem um vetor lateral (com correção de quina, para a linha ficar à
     *   mesma distância dos dois segmentos vizinhos). Os pontos ficam a PASSO unidades um do outro, então o comprimento
     *   de arco global é `índice * PASSO`; o tracejado é função dele e por isso é contínuo entre chunks.
     * - Cada trecho pertence ao chunk que contém o seu meio, e as seções das pontas são calculadas dos mesmos pontos
     *   nos dois chunks: não sobra fresta nem sobreposição.
     * - A altura vem da MESMA superfície da malha do terreno e da física (Terreno.criarAmostradorAltura), com as seções
     *   a cada ~PASSO_FITA unidades para acompanhar as quebras entre os triângulos, mais uma folga pequena.
     * - Vértices locais ao chunk (como os do terreno), para manter os floats pequenos longe da origem.
     * Devolve null se desligadas, ou se a pista não passa pelo chunk.
     */
    gerarMarcacoesChunk(cx: number, cz: number, tam: number): Malha | null {
        const c = this.config.estrada.estrada;
        if (!c.marcacoes || this.pf.b - this.pf.a < 3) return null;

        const larg = Math.max(0.05, c.linhaLargura);
        const dBorda = this.hw - Math.max(0, c.linhaMargem) - larg / 2;      // distância do centro da linha lateral ao eixo
        const traco = Math.max(0, c.tracoComprimento), periodo = traco + Math.max(0, c.tracoVao);
        const x0 = cx * tam, z0 = cz * tam;

        // pontos que cobrem o chunk (z cresce com o índice); as fitas ficam a até `hw` do eixo, então a folga em z
        const ia = Math.max(this.pf.a + 1, this.indiceDeZ(z0 - this.hw - 2 * PASSO));
        const ib = Math.min(this.pf.b - 1, this.indiceDeZ(z0 + tam + this.hw + 2 * PASSO) + 1);
        if (ib - ia < 1) return null;

        // por ponto: posição e vetor lateral (por unidade de distância ao eixo, com correção de quina)
        const n = ib - ia + 1;
        const PX = new Float64Array(n), PZ = new Float64Array(n), MX = new Float64Array(n), MZ = new Float64Array(n);
        for (let k = 0; k < n; ++k) {
            const p = this.pt(ia + k), a = this.pt(ia + k - 1), b = this.pt(ia + k + 1);
            const d1x = p.x - a.x, d1z = p.z - a.z, l1 = Math.hypot(d1x, d1z) || 1;
            const d2x = b.x - p.x, d2z = b.z - p.z, l2 = Math.hypot(d2x, d2z) || 1;
            const n1x = d1z / l1, n1z = -d1x / l1, n2x = d2z / l2, n2z = -d2x / l2;
            let nx = n1x + n2x, nz = n1z + n2z;
            const ln = Math.hypot(nx, nz) || 1;
            nx /= ln; nz /= ln;
            const cos = Math.max(0.5, nx * n1x + nz * n1z);
            PX[k] = p.x; PZ[k] = p.z; MX[k] = nx / cos; MZ[k] = nz / cos;
        }

        // ponto da fita em s (comprimento de arco) a distância lateral d do eixo
        let rx = 0, rz = 0;
        const ponto = (s: number, d: number) => {
            const kf = s / PASSO;
            let k = Math.floor(kf);
            if (k < ia) k = ia; else if (k > ib - 1) k = ib - 1;
            const u = kf - k, j = k - ia;
            rx = PX[j] + (PX[j + 1] - PX[j]) * u + d * (MX[j] + (MX[j + 1] - MX[j]) * u);
            rz = PZ[j] + (PZ[j + 1] - PZ[j]) * u + d * (MZ[j] + (MZ[j + 1] - MZ[j]) * u);
        };
        const noChunk = (s: number, d: number) => {
            ponto(s, d);
            return Math.floor(rx / tam) === cx && Math.floor(rz / tam) === cz;
        };

        const altura = this.terreno.criarAmostradorAltura();
        const P: number[] = [], C: number[] = [], I: number[] = [];
        // fita de s0 a s1, centrada na distância lateral d, com largura w: pares de vértices (lado a, lado b) por seção
        const fita = (s0: number, s1: number, d: number, w: number) => {
            const ns = Math.max(1, Math.ceil((s1 - s0) / PASSO_FITA));
            const base = P.length / 3;
            for (let q = 0; q <= ns; ++q) {
                const s = s0 + (s1 - s0) * q / ns;
                for (const lado of [-0.5, 0.5]) {
                    ponto(s, d + lado * w);
                    P.push(rx - x0, altura(rx, rz) + ELEVACAO_MARCACAO, rz - z0);
                    C.push(COR_MARCACAO[0], COR_MARCACAO[1], COR_MARCACAO[2]);
                }
            }
            for (let q = 0; q < ns; ++q) {
                const a0 = base + 2 * q, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
                I.push(a0, b0, a1, b0, b1, a1);
            }
        };

        // linhas laterais, contínuas: um trecho por segmento da linha central
        if (dBorda > larg) {
            for (let k = ia; k < ib; ++k) {
                const sMeio = (k + 0.5) * PASSO;
                for (const d of [dBorda, -dBorda]) {
                    if (noChunk(sMeio, d)) fita(k * PASSO, (k + 1) * PASSO, d, larg);
                }
            }
        }
        // linha central tracejada: o padrão depende só do comprimento de arco global
        if (traco > 0.01 && periodo > 0.5) {
            const sMin = ia * PASSO, sMax = ib * PASSO;
            for (let m = Math.ceil(sMin / periodo); m * periodo + traco <= sMax; ++m) {
                const s0 = m * periodo;
                if (noChunk(s0 + traco / 2, 0)) fita(s0, s0 + traco, 0, larg);
            }
        }

        if (I.length === 0) return null;
        return { positions: Float32Array.from(P), colors: Float32Array.from(C), indices: Uint32Array.from(I) };
    }

    /**
     * Malha COMPLETA do terreno do chunk (cx, cz) para chunks que a pista atravessa: grama e asfalto na MESMA malha, sem
     * nenhum triângulo de terreno por baixo do asfalto (não há duas superfícies sobrepostas: nada de z-fighting).
     * Devolve null se a pista não toca o chunk (ele usa então a malha comum, em pool).
     *
     * `pos` são os vértices da grade (x, y, z locais, como em Terreno.preencherChunk). A borda do asfalto é a curva
     * "distância à linha central = largura/2". Os vértices da pista ficam onde essa curva cruza as ARESTAS da grade:
     * esses cruzamentos são calculados uma única vez por aresta, em coordenadas do mundo, e usados pelos dois
     * triângulos que a dividem (e pelo chunk vizinho, na borda do chunk), então os pedaços nunca deixam fresta.
     * Em cada triângulo a borda segue a curva real, em pontos a cada ~ESPACO_BORDA unidades. Todos os pontos ficam no
     * plano do triângulo, ou seja, na superfície que a física lê.
     */
    gerarMalhaTerrenoChunk(cx: number, cz: number, tam: number, esp: number, celulas: number, pos: Float32Array, coresGrade: Float32Array): Malha | null {
        if (this.pf.b <= this.pf.a) return null;
        const hw = this.hw, n = celulas + 1, x0 = cx * tam, z0 = cz * tam;
        const R = hw + 215;                                    // além disso o ponto está "longe" da pista (> meia diagonal de uma célula)

        // f > 0 dentro do asfalto, f < 0 fora; (a distância assinada à borda)
        const f = (x: number, z: number): number => (this.consultar(x, z, R) ? hw - this.resD : -1e9);
        const wx = (i: number) => (cx * celulas + i) * esp;     // coordenada de mundo do vértice da grade (dupla precisão)
        const wz = (j: number) => (cz * celulas + j) * esp;
        const fv = new Float64Array(n * n).fill(NaN);
        const fVert = (i: number, j: number) => {
            const k = j * n + i;
            let v = fv[k];
            if (v !== v) { v = f(wx(i), wz(j)); fv[k] = v; }
            return v;
        };

        // cruzamentos da borda com uma aresta da grade, em coordenadas locais, ordenados de a para b
        interface Cruz { x: number; z: number }
        const cache = new Map<number, Cruz[]>();
        const cruzamentos = (i0: number, j0: number, i1: number, j1: number): Cruz[] => {
            let inv = false;
            if (j1 < j0 || (j1 === j0 && i1 < i0)) { [i0, j0, i1, j1] = [i1, j1, i0, j0]; inv = true; }   // ordem canônica
            const chave = (j0 * n + i0) * n * n + (j1 * n + i1);
            let r = cache.get(chave);
            if (!r) {
                r = [];
                const ax = wx(i0), az = wz(j0), bx = wx(i1), bz = wz(j1), len = Math.hypot(bx - ax, bz - az);
                const fa = fVert(i0, j0), fb = fVert(i1, j1);
                if (!(fa < -len && fb < -len)) {                    // senão a aresta inteira está a mais de `largura/2` da pista
                    const M = 12;
                    let tp = 0, fp = fa;
                    for (let k = 1; k <= M; ++k) {
                        const t = k / M;
                        const fk = k === M ? fb : f(ax + (bx - ax) * t, az + (bz - az) * t);
                        if ((fp > 0) !== (fk > 0)) {
                            let lo = tp, hi = t, flo = fp;           // bisseção: o sinal troca entre lo e hi
                            for (let it = 0; it < 20; ++it) {                // 150 / 2^20: bem abaixo de 0.001 unidade
                                const mid = 0.5 * (lo + hi), fm = f(ax + (bx - ax) * mid, az + (bz - az) * mid);
                                if ((flo > 0) === (fm > 0)) { lo = mid; flo = fm; } else hi = mid;
                            }
                            const tc = Math.min(1 - 1e-4, Math.max(1e-4, 0.5 * (lo + hi)));   // nunca colado num vértice
                            r.push({ x: ax + (bx - ax) * tc - x0, z: az + (bz - az) * tc - z0 });
                        }
                        tp = t; fp = fk;
                    }
                }
                cache.set(chave, r);
            }
            return inv ? r.slice().reverse() : r;
        };

        const P: number[] = [], C: number[] = [], I: number[] = [];
        const nBase = n * n;
        let nExtra = 0;
        const substituido = new Uint8Array(celulas * celulas * 2);
        let algum = false;

        interface Item { x: number; z: number; cruz: boolean; estado: boolean }

        for (let j = 0; j < celulas; ++j) for (let i = 0; i < celulas; ++i) {
            // nenhum canto da célula perto da pista: não há o que fazer nela
            if (fVert(i, j) < -110 && fVert(i + 1, j) < -110 && fVert(i, j + 1) < -110 && fVert(i + 1, j + 1) < -110) continue;

            for (let h = 0; h < 2; ++h) {
                // triângulo da grade, na mesma ordem de Terreno.gerarIndices: (i0,i2,i1) e (i1,i2,i3)
                const ci = h === 0 ? [[i, j], [i, j + 1], [i + 1, j]] : [[i + 1, j], [i, j + 1], [i + 1, j + 1]];
                const tx = ci.map(([a, b]) => pos[(b * n + a) * 3]);
                const ty = ci.map(([a, b]) => pos[(b * n + a) * 3 + 1]);
                const tz = ci.map(([a, b]) => pos[(b * n + a) * 3 + 2]);
                const dentro = ci.map(([a, b]) => fVert(a, b) > 0);

                // perímetro: cantos e, entre eles, os cruzamentos da borda do asfalto com cada aresta
                const per: Item[] = [];
                let estado = dentro[0];
                for (let e = 0; e < 3; ++e) {
                    per.push({ x: tx[e], z: tz[e], cruz: false, estado });
                    const a = ci[e], b = ci[(e + 1) % 3];
                    for (const q of cruzamentos(a[0], a[1], b[0], b[1])) { estado = !estado; per.push({ x: q.x, z: q.z, cruz: true, estado }); }
                }
                const ic: number[] = [];
                per.forEach((it, k) => { if (it.cruz) ic.push(k); });
                const N = ic.length;
                if (N % 2 !== 0 || estado !== dentro[0]) continue;      // não deveria acontecer (paridade); deixa o triângulo como está

                const celula = j * celulas + i, chave = celula * 2 + h;
                // plano do triângulo da grade: y(x, z) por coordenadas baricêntricas
                const det = (tz[1] - tz[2]) * (tx[0] - tx[2]) + (tx[2] - tx[1]) * (tz[0] - tz[2]);
                const yEm = (x: number, z: number) => {
                    const l1 = ((tz[1] - tz[2]) * (x - tx[2]) + (tx[2] - tx[1]) * (z - tz[2])) / det;
                    const l2 = ((tz[2] - tz[0]) * (x - tx[2]) + (tx[0] - tx[2]) * (z - tz[2])) / det;
                    return l1 * ty[0] + l2 * ty[1] + (1 - l1 - l2) * ty[2];
                };
                // cores dos três cantos do triângulo da grade: a grama dos pedaços novos interpola entre elas, então
                // continua combinando com o terreno em volta (que é colorido por vértice)
                const k0 = (ci[0][1] * n + ci[0][0]) * 3, k1 = (ci[1][1] * n + ci[1][0]) * 3, k2 = (ci[2][1] * n + ci[2][0]) * 3;
                const emitir = (xs: number[], zs: number[], asfalto: boolean) => {
                    const base = nBase + nExtra;
                    for (let q = 0; q < xs.length; ++q) {
                        P.push(xs[q], yEm(xs[q], zs[q]), zs[q]);
                        if (asfalto) { C.push(COR_ASFALTO[0], COR_ASFALTO[1], COR_ASFALTO[2]); continue; }
                        const l1 = ((tz[1] - tz[2]) * (xs[q] - tx[2]) + (tx[2] - tx[1]) * (zs[q] - tz[2])) / det;
                        const l2 = ((tz[2] - tz[0]) * (xs[q] - tx[2]) + (tx[0] - tx[2]) * (zs[q] - tz[2])) / det;
                        const l3 = 1 - l1 - l2;
                        for (let c3 = 0; c3 < 3; ++c3) C.push(l1 * coresGrade[k0 + c3] + l2 * coresGrade[k1 + c3] + l3 * coresGrade[k2 + c3]);
                    }
                    nExtra += xs.length;
                    const t = triangularPoligono(xs, zs);
                    for (const idx of t) I.push(base + idx);
                };

                if (N === 0) {                                          // triângulo inteiro dentro do asfalto, ou inteiro fora (fica o original)
                    if (!dentro[0]) continue;
                    emitir(tx.slice(), tz.slice(), true);
                    substituido[chave] = 1; algum = true;
                    continue;
                }

                // arcos do perímetro entre cruzamentos consecutivos: dentro/fora do asfalto, alternando
                const arcos = ic.map((k, a) => ({ ini: k, fim: ic[(a + 1) % N], dentro: per[k].estado }));
                const meio = (a: { ini: number; fim: number }) => f(x0 + 0.5 * (per[a.ini].x + per[a.fim].x), z0 + 0.5 * (per[a.ini].z + per[a.fim].z));
                // cada corte liga as pontas de um arco e separa esse arco do resto; corta-se os arcos de grama ou os de asfalto,
                // o que tiver os cortes mais próximos da borda verdadeira (|f| no meio da corda)
                const desvio = (dentroArco: boolean) => arcos.filter(a => a.dentro === dentroArco).reduce((s2, a) => s2 + Math.abs(meio(a)), 0);
                const cortaAsfalto = N > 2 && desvio(true) < desvio(false);
                const corta = arcos.map(a => a.dentro === cortaAsfalto);

                /** pontos sobre a curva da borda entre dois cruzamentos (exclusive as pontas), em ordem de a para b */
                const borda = (a: Item, b: Item): { x: number; z: number }[] => {
                    const len = Math.hypot(b.x - a.x, b.z - a.z);
                    const K = Math.min(16, Math.max(0, Math.ceil(len / ESPACO_BORDA) - 1));
                    const pts: { x: number; z: number }[] = [];
                    let ultimo = 0;
                    for (let u = 1; u <= K; ++u) {
                        const qx = a.x + (b.x - a.x) * u / (K + 1), qz = a.z + (b.z - a.z) * u / (K + 1);
                        if (!this.consultar(x0 + qx, z0 + qz, R) || this.resD < 1e-6) continue;
                        const pa = this.pt(this.resI), pb = this.pt(this.resI + 1), t = this.resT;
                        const nx = pa.x + (pb.x - pa.x) * t - x0, nz = pa.z + (pb.z - pa.z) * t - z0;
                        const d = this.resD;
                        const px = nx + (qx - nx) / d * hw, pz = nz + (qz - nz) / d * hw;      // projeta sobre a curva "distância = largura/2"
                        // precisa continuar dentro do triângulo e avançar ao longo da corda
                        const c1 = (tx[1] - tx[0]) * (pz - tz[0]) - (tz[1] - tz[0]) * (px - tx[0]);
                        const c2 = (tx[2] - tx[1]) * (pz - tz[1]) - (tz[2] - tz[1]) * (px - tx[1]);
                        const c3 = (tx[0] - tx[2]) * (pz - tz[2]) - (tz[0] - tz[2]) * (px - tx[2]);
                        const sinal = (tx[1] - tx[0]) * (tz[2] - tz[0]) - (tz[1] - tz[0]) * (tx[2] - tx[0]) > 0 ? 1 : -1;
                        if (c1 * sinal < 1e-3 || c2 * sinal < 1e-3 || c3 * sinal < 1e-3) continue;
                        const ao = ((px - a.x) * (b.x - a.x) + (pz - a.z) * (b.z - a.z)) / (len * len);
                        if (ao <= ultimo + 1e-3 || ao >= 1 - 1e-3) continue;
                        ultimo = ao;
                        pts.push({ x: px, z: pz });
                    }
                    return pts;
                };
                const curva = arcos.map((a, k) => (corta[k] ? borda(per[a.ini], per[a.fim]) : []));

                // pedaços cortados: o arco do perímetro fechado pela curva da borda
                for (let k = 0; k < N; ++k) {
                    if (!corta[k]) continue;
                    const xs: number[] = [], zs: number[] = [];
                    for (let q = arcos[k].ini; ; q = (q + 1) % per.length) {
                        xs.push(per[q].x); zs.push(per[q].z);
                        if (q === arcos[k].fim) break;
                    }
                    for (let q = curva[k].length - 1; q >= 0; --q) { xs.push(curva[k][q].x); zs.push(curva[k][q].z); }
                    if (xs.length >= 3) emitir(xs, zs, arcos[k].dentro);
                }
                // o resto: os arcos não cortados, e a curva da borda no lugar dos cortados
                {
                    const xs: number[] = [], zs: number[] = [];
                    for (let k = 0; k < N; ++k) {
                        xs.push(per[arcos[k].ini].x); zs.push(per[arcos[k].ini].z);
                        if (corta[k]) { for (const p of curva[k]) { xs.push(p.x); zs.push(p.z); } }
                        else for (let q = (arcos[k].ini + 1) % per.length; q !== arcos[k].fim; q = (q + 1) % per.length) { xs.push(per[q].x); zs.push(per[q].z); }
                    }
                    const dentroResto = !arcos.find((a, k) => corta[k])!.dentro;
                    if (xs.length >= 3) emitir(xs, zs, dentroResto);
                }
                substituido[chave] = 1; algum = true;
            }
        }
        if (!algum) return null;

        // malha final: grade completa (sem os triângulos substituídos) + os pedaços novos
        const positions = new Float32Array(pos.length + P.length);
        positions.set(pos); positions.set(P, pos.length);
        const colors = new Float32Array(positions.length);
        colors.set(coresGrade.subarray(0, nBase * 3));
        colors.set(C, nBase * 3);
        const base: number[] = [];
        for (let j = 0; j < celulas; ++j) for (let i = 0; i < celulas; ++i) {
            const i0 = j * n + i, i1 = j * n + i + 1, i2 = (j + 1) * n + i, i3 = (j + 1) * n + i + 1, cel = j * celulas + i;
            if (!substituido[cel * 2]) base.push(i0, i2, i1);
            if (!substituido[cel * 2 + 1]) base.push(i1, i2, i3);
        }
        const indices = new Uint32Array(base.length + I.length);
        indices.set(base); indices.set(I, base.length);
        return { positions, colors, indices };
    }
}