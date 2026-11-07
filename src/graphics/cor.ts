// cor.ts   conversão HSV -> RGB e leitura das cores de luz do GAME_CONFIG.
import type { GAME_CONFIG } from '@/core/config';

export type RGB = [number, number, number];
type Luz = typeof GAME_CONFIG.luz.parametros;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** h em graus (qualquer valor, é normalizado para 0-360), s e v em 0-1. Retorna r,g,b em 0-1. */
export function hsvParaRgb(h: number, s: number, v: number): RGB {
    const hh = (((h % 360) + 360) % 360) / 60;
    const ss = clamp01(s);
    const vv = clamp01(v);
    const f = (n: number) => {
        const k = (n + hh) % 6;
        return vv - vv * ss * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [f(5), f(3), f(1)];
}

/** o CSS não tem hsv(): a amostra do painel usa o RGB equivalente */
export function hsvParaCss(h: number, s: number, v: number): string {
    const [r, g, b] = hsvParaRgb(h, s, v);
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

export const corSol = (l: Luz): RGB => hsvParaRgb(l.corH, l.corS, l.corV);
export const corCeu = (l: Luz): RGB => hsvParaRgb(l.ceuH, l.ceuS, l.ceuV);
export const corAmbiente = (l: Luz): RGB => hsvParaRgb(l.ambienteH, l.ambienteS, l.ambienteV);
