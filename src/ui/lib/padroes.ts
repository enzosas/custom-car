// padroes.ts — cópia do GAME_CONFIG tirada quando o módulo carrega (antes de qualquer arrasto no painel).
// Serve para a sensibilidade de cada campo depender do valor PADRÃO dele e não do valor atual: sem isso, um campo
// que começa em 0 mudaria de sensibilidade depois de ser arrastado e a aba reaberta.
import { GAME_CONFIG } from '@/core/config';

const PADROES = structuredClone(GAME_CONFIG) as unknown as Record<string, unknown>;

/** valor padrão de `chave` no objeto em `caminho` (ex.: ['carro', 'fisica']), ou undefined se não for número */
export function valorPadrao(caminho: string[], chave: string): number | undefined {
    let o: any = PADROES;
    for (const k of caminho) o = o?.[k];
    const v = o?.[chave];
    return typeof v === 'number' ? v : undefined;
}