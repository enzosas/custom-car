// propriedade.ts — lógica pura (sem DOM) de ajuste de valores do GAME_CONFIG.
// Portado da antiga classe `Propriedade`.

import type { CampoDef } from '../painelCampos';

export interface Alvo {
    obj: Record<string, number>;
    chave: string;
    tipo: CampoDef['tipo'];
    fator: number;
}

/** Estado de uma sessão de arrasto (do pointerdown ao pointerup). */
export interface SessaoArrasto {
    base: number;
    /** Valor "contínuo" para campos inteiros, para não perder arrastos pequenos no arredondamento. */
    acumulado: number;
}

export function resolverObjeto(config: unknown, caminho: string[]): Record<string, number> {
    let obj: any = config;
    for (const k of caminho) obj = obj[k];
    return obj;
}

function valorBase(a: Alvo): number {
    if (a.tipo === 'float') {
        const base = a.obj[a.chave] / a.fator;
        return Math.abs(base) < 0.0001 ? 1 : base;
    }
    return Math.max(1, a.obj[a.chave]);
}

export function iniciarSessao(a: Alvo): SessaoArrasto {
    return { base: valorBase(a), acumulado: a.obj[a.chave] };
}

export function arrastar(a: Alvo, s: SessaoArrasto, deltaX: number, acelerado: boolean) {
    const taxa = acelerado ? 1.0 : 0.10;
    let mudancaPorPixel = (s.base * taxa) / 100;

    if (a.tipo === 'float') {
        if (Math.abs(mudancaPorPixel) < 0.001) mudancaPorPixel = 0.01;
        a.obj[a.chave] += deltaX * mudancaPorPixel * a.fator;
    } else {
        s.acumulado = Math.max(0, s.acumulado + deltaX * mudancaPorPixel);
        a.obj[a.chave] = Math.round(s.acumulado);
    }
}

export function formatarValor(a: Alvo): string {
    return a.tipo === 'float' ? (a.obj[a.chave] / a.fator).toFixed(4) : String(a.obj[a.chave]);
}
