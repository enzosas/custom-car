// padroes.ts — cópia do GAME_CONFIG tirada quando o módulo carrega (antes de qualquer arrasto no painel).
// Serve para a sensibilidade de cada campo depender do valor PADRÃO dele e não do valor atual: sem isso, um campo
// que começa em 0 mudaria de sensibilidade depois de ser arrastado e a aba reaberta.
import { GAME_CONFIG, PERFIL_CARRO_GLB } from '@/core/config';
import type { AbaDef } from '../painelCampos';
import { resolverObjeto } from './propriedade';

const PADROES = structuredClone(GAME_CONFIG) as unknown as Record<string, unknown>;

/** valor padrão de `chave` no objeto em `caminho` (ex.: ['carro', 'fisica']), ou undefined se não for número */
export function valorPadrao(caminho: string[], chave: string): number | undefined {
    let o: any = PADROES;
    for (const k of caminho) o = o?.[k];
    const v = o?.[chave];
    return typeof v === 'number' ? v : undefined;
}

// ---- modo "resetar configs" ----
type Valor = number | boolean;

function ler(raiz: unknown, caminho: string[], chave: string): Valor | undefined {
    let o: any = raiz;
    for (const k of caminho) o = o?.[k];
    const v = o?.[chave];
    return typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
}

/**
 * valor original de um campo (número) ou interruptor (booleano) do painel.
 * Os campos do carro voltam ao perfil ativo: a cópia do carro vermelho tirada no carregamento, ou o perfil do modelo GLB.
 */
export function valorOriginal(caminho: string[], chave: string, carroGLB: boolean): Valor | undefined {
    if (carroGLB && caminho[0] === 'carro') return ler(PERFIL_CARRO_GLB, caminho.slice(1), chave);
    return ler(PADROES, caminho, chave);
}

/** true se o valor atual difere do original (tolerância para números, que vêm de arrasto) */
export function foiAlterado(atual: unknown, original: Valor | undefined): boolean {
    if (original === undefined) return false;
    if (typeof original === 'boolean') return typeof atual === 'boolean' && atual !== original;
    return typeof atual === 'number' && Math.abs(atual - original) > 1e-9;
}

/** identifica um campo/interruptor dentro do painel (mesmo `nome` pode existir em seções diferentes) */
export const idItem = (caminho: string[], chave: string) => `${caminho.join('.')}|${chave}`;

export interface ItemAlterado { id: string; objeto: Record<string, unknown>; chave: string; original: Valor }

/** campos e interruptores de uma aba cujo valor difere do original */
export function itensAlterados(aba: AbaDef, config: unknown, carroGLB: boolean): ItemAlterado[] {
    const itens: ItemAlterado[] = [];
    for (const sec of aba.secoes) {
        const objeto = resolverObjeto(config, sec.caminho) as unknown as Record<string, unknown>;
        const chaves = [...sec.campos.map((c) => c.nome), ...(sec.interruptores ?? []).map((i) => i.nome)];
        for (const chave of chaves) {
            const original = valorOriginal(sec.caminho, chave, carroGLB);
            if (original !== undefined && foiAlterado(objeto[chave], original)) {
                itens.push({ id: idItem(sec.caminho, chave), objeto, chave, original });
            }
        }
    }
    return itens;
}
