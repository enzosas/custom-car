// Atmosfera.ts — posição do sol e todas as cores que dependem dela (luz, ambiente, horizonte, alto do céu).
//
// Uma função pura por frame: lê a luz "de dia" do config (luz.parametros) e a configuração do céu (ceu.parametros) e
// devolve o que o resto do jogo precisa. A luz do config é o visual de DIA; ao baixar o sol as cores escorregam para
// o pôr do sol (laranja) e para a noite (azul escuro, com luar), sem tocar no config.
import type { GAME_CONFIG } from '@/core/config';
import { corSol, corCeu, corAmbiente, hsvParaRgb, type RGB } from './cor';

type Luz = typeof GAME_CONFIG.luz.parametros;
type CfgCeu = typeof GAME_CONFIG.ceu.parametros;
type V3 = [number, number, number];

export interface Atmosfera {
    /** direção (unitária) da luz que ilumina o mundo e projeta a sombra: o sol, ou o luar à noite. Nunca fica rasante demais */
    dirLuz: V3;
    /** direção real do sol (pode estar abaixo do horizonte): disco do sol e brilho da neblina */
    dirSol: V3;
    corLuz: RGB;
    corAmbiente: RGB;
    /** cor do céu no horizonte: também é a cor da neblina e do fundo da tela */
    corHorizonte: RGB;
    /** cor do céu no alto */
    corZenite: RGB;
    /** cor do disco, do halo e do brilho da neblina em volta do sol */
    corBrilhoSol: RGB;
    intAmbiente: number;
    intDifusa: number;
    intEspecular: number;
    shininess: number;
    neblina: number;
    /** quanto a neblina clareia na direção do sol (0..1) */
    brilhoNeblina: number;
    /** 0 = dia, 1 = noite fechada (visibilidade das estrelas) */
    noite: number;
    /** seno da elevação do sol: 1 = a pino, 0 = no horizonte, < 0 = abaixo */
    elevacao: number;
}

export function criarAtmosfera(): Atmosfera {
    return {
        dirLuz: [0, 1, 0], dirSol: [0, 1, 0],
        corLuz: [1, 1, 1], corAmbiente: [1, 1, 1], corHorizonte: [1, 1, 1], corZenite: [1, 1, 1], corBrilhoSol: [1, 1, 1],
        intAmbiente: 0.5, intDifusa: 0.45, intEspecular: 0.05, shininess: 20, neblina: 1, brilhoNeblina: 0, noite: 0, elevacao: 1,
    };
}

const POENTE_SOL: RGB = [1.0, 0.55, 0.30];
const LUA: RGB = [0.55, 0.65, 1.0];
const AMBIENTE_NOITE: RGB = [0.30, 0.36, 0.62];
const AMBIENTE_QUENTE: RGB = [1.0, 0.78, 0.62];
const HORIZONTE_NOITE: RGB = [0.02, 0.035, 0.09];
const HORIZONTE_POENTE: RGB = [0.96, 0.60, 0.40];
const ZENITE_NOITE: RGB = [0.004, 0.010, 0.040];
const ZENITE_POENTE: RGB = [0.28, 0.30, 0.52];

/** menor elevação (seno) usada para iluminar e projetar sombra: o sol rasante daria sombras gigantes e instáveis */
const ELEVACAO_MIN_LUZ = 0.22;
const ELEVACAO_LUA = 0.7;

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const suave = (a: number, b: number, x: number) => { const t = limitar((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rad = (g: number) => g * Math.PI / 180;

function mistura(a: RGB, b: RGB, t: number, out: RGB): RGB {
    out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
}

const tmpA: RGB = [0, 0, 0], tmpB: RGB = [0, 0, 0], corDoSol: RGB = [0, 0, 0];

/** posição do sol (vetor unitário) para a hora dada: nasce em 6h no leste, a pino em 12h, se põe em 18h no oeste */
export function direcaoDoSol(c: CfgCeu, l: Luz, out: V3): V3 {
    if (!c.usarHora) {
        const n = Math.hypot(l.dirX, l.dirY, l.dirZ) || 1;
        out[0] = l.dirX / n; out[1] = l.dirY / n; out[2] = l.dirZ / n;
        return out;
    }
    const th = ((c.hora - 6) / 12) * Math.PI;                 // 0 = nascer, PI/2 = meio-dia, PI = pôr do sol
    const az = rad(c.azimute), inc = rad(c.inclinacaoSol);
    const ex = Math.cos(az), ez = Math.sin(az);                // leste: direção horizontal do nascente
    const sx = -Math.sin(az), sz = Math.cos(az);               // horizontal perpendicular: para onde a trajetória se inclina
    const cima = Math.cos(inc), lado = Math.sin(inc);          // "cima" da trajetória do sol
    const c1 = Math.cos(th), s1 = Math.sin(th);
    out[0] = c1 * ex + s1 * lado * sx;
    out[1] = s1 * cima;
    out[2] = c1 * ez + s1 * lado * sz;
    return out;
}

export function calcularAtmosfera(l: Luz, c: CfgCeu, a: Atmosfera) {
    direcaoDoSol(c, l, a.dirSol);
    const [sx, sy, sz] = a.dirSol;
    a.elevacao = sy;

    const dia = suave(-0.10, 0.28, sy);                        // 0 noite -> 1 dia
    const poente = Math.exp(-(((sy - 0.04) / 0.20) ** 2));      // 1 com o sol logo acima do horizonte
    const luzSolar = suave(-0.04, 0.10, sy);                   // quanto da luz vem do sol (o resto é luar): o sol mantém a luz quente até encostar no horizonte

    // direção da luz: o sol (sem deixar ficar rasante) ou o luar, que vem do lado oposto do céu
    const h = Math.hypot(sx, sz);
    const ySol = Math.max(sy, ELEVACAO_MIN_LUZ);
    const kS = h > 1e-6 ? Math.sqrt(1 - ySol * ySol) / h : 0;
    const kL = h > 1e-6 ? Math.sqrt(1 - ELEVACAO_LUA * ELEVACAO_LUA) / h : 0;
    const lx = -sx * kL + (sx * kS + sx * kL) * luzSolar;
    const ly = ELEVACAO_LUA + (ySol - ELEVACAO_LUA) * luzSolar;
    const lz = -sz * kL + (sz * kS + sz * kL) * luzSolar;
    const nl = Math.hypot(lx, ly, lz) || 1;
    a.dirLuz[0] = lx / nl; a.dirLuz[1] = ly / nl; a.dirLuz[2] = lz / nl;

    // cor do sol (alaranjada no poente) e da luz: sol ou luar
    mistura(corSol(l), POENTE_SOL, poente * 0.85, corDoSol);
    mistura(LUA, corDoSol, luzSolar, a.corLuz);
    a.intDifusa = l.intensidadeDifusa * (0.30 + 0.70 * luzSolar);
    a.intEspecular = l.intensidadeEspecular * luzSolar;
    a.shininess = l.shininess;
    a.neblina = l.neblina;

    // ambiente: azulado à noite; o tom quente do poente vem POR CIMA da mistura dia/noite (o poente acontece justamente
    // quando o fator de dia já está baixo, então multiplicá-lo por ele apagaria o efeito)
    mistura(AMBIENTE_NOITE, corAmbiente(l), dia, tmpA);
    mistura(tmpA, AMBIENTE_QUENTE, poente * 0.35, a.corAmbiente);
    a.intAmbiente = l.intensidadeAmbiente * (0.55 + 0.45 * dia);

    // céu: horizonte (= neblina = fundo) e alto. Dia -> noite, e por cima o tom do poente (que também aparece um pouco
    // depois que o sol se põe: o crepúsculo)
    mistura(HORIZONTE_NOITE, corCeu(l), dia, tmpA);
    mistura(tmpA, HORIZONTE_POENTE, poente * 0.8, a.corHorizonte);
    mistura(ZENITE_NOITE, hsvParaRgb(c.zeniteH, c.zeniteS, c.zeniteV), dia, tmpB);
    mistura(tmpB, ZENITE_POENTE, poente * 0.55, a.corZenite);

    // disco e brilho em volta do sol: sempre a cor do SOL (alaranjada no poente), nunca a do luar; o brilho é mais
    // forte no poente e some quando o sol está bem abaixo do horizonte
    a.corBrilhoSol[0] = corDoSol[0]; a.corBrilhoSol[1] = corDoSol[1]; a.corBrilhoSol[2] = corDoSol[2];
    a.brilhoNeblina = (0.12 + 0.55 * poente) * suave(-0.12, 0.05, sy);
    a.noite = 1 - suave(-0.20, 0.0, sy);
}