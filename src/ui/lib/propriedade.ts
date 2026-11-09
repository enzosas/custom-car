// propriedade.ts - Lógica de ajuste de valores do GAME_CONFIG por arrasto
import type { CampoDef } from '../painelCampos';

export interface Alvo {
    obj: Record<string, number>;
    chave: string;
    tipo: CampoDef['tipo'];
    min?: number;
    max?: number;
    ciclico?: boolean;
}

export interface SessaoArrasto {
    acumulado: number;
}

export function resolverObjeto(config: unknown, caminho: string[]): Record<string, number> {
    let obj: any = config;
    for (const k of caminho) obj = obj[k];
    return obj;
}

export function iniciarSessao(a: Alvo): SessaoArrasto {
    // Fallback `?? 0` para o caso da interface renderizar antes do objeto estar 100% pronto
    return { acumulado: a.obj[a.chave] ?? 0 };
}

export function arrastar(a: Alvo, s: SessaoArrasto, deltaX: number, acelerado: boolean, precisao: boolean, passoBase: number) {
    // Multiplicadores de controle: Shift = 10x (rápido), Alt/Option = 0.1x (precisão)
    const multiplicador = acelerado ? 10 : (precisao ? 0.1 : 1);
    const mudanca = deltaX * passoBase * multiplicador;

    s.acumulado += mudanca;
    let novoValor = s.acumulado;

    if (a.min !== undefined && a.max !== undefined) {
        if (a.ciclico) {
            const faixa = a.max - a.min;
            novoValor = a.min + ((((novoValor - a.min) % faixa) + faixa) % faixa);
        } else {
            novoValor = Math.max(a.min, Math.min(a.max, novoValor));
        }
        s.acumulado = novoValor; // Previne que o delta contínuo "fuja" muito além do limite visual
    } else if (a.tipo === 'uint') {
        novoValor = Math.max(0, novoValor);
        s.acumulado = Math.max(0, s.acumulado);
    }

    a.obj[a.chave] = a.tipo === 'uint' ? Math.round(novoValor) : novoValor;
}

export function formatarValor(a: Alvo): string {
    // Fallback de segurança contra 'Cannot read properties of undefined'
    const valor = a.obj[a.chave] ?? 0;
    // O construtor Number() em volta de toFixed limpa os zeros inúteis do final
    return a.tipo === 'float' ? Number(valor.toFixed(4)).toString() : String(valor);
}