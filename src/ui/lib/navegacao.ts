// navegacao.ts - navegação do painel de config pelo teclado (I J K L): tipos e a lista de itens navegáveis de uma aba
import type { AbaDef } from '../painelCampos';

/**
 * Onde o cursor está:
 *  - oculto: sem cursor (I, K ou L o fazem aparecer nos botões das abas);
 *  - botoes: nos botões das abas (I/K andam, L abre a aba, J esconde);
 *  - janela: dentro da aba aberta (I/K andam pelos itens, L seleciona/aciona, J fecha a aba);
 *  - campo: um campo arrastável selecionado (I aumenta, K diminui, J solta).
 */
export type NivelNav = 'oculto' | 'botoes' | 'janela' | 'campo';

/** o que cada item da janela é; L seleciona um campo e aciona os outros */
export type TipoItemNav = 'estilo' | 'campo' | 'chave' | 'botao';

/** um passo de valor pedido pelo teclado: muda `seq` a cada tecla; `dir` +1 (I) ou -1 (K); `rapido` = Shift */
export interface PassoNav { seq: number; dir: 1 | -1; rapido: boolean }

/** estado da navegação que a lista de campos precisa saber (null quando o cursor não está dentro da janela) */
export interface NavLista {
    item: number;
    selecionado: boolean;
    passo: PassoNav;
    /** muda a cada L num item que não é campo (interruptor, botão, seletor de estilo) */
    acionar: number;
}

/** itens navegáveis da aba, na MESMA ordem em que o FieldList os desenha */
export function itensNavegaveis(aba: AbaDef): TipoItemNav[] {
    const itens: TipoItemNav[] = [];
    for (const sec of aba.secoes) {
        if (sec.seletorEstilo) itens.push('estilo');
        for (let i = 0; i < sec.campos.length; ++i) itens.push('campo');
        for (let i = 0; i < (sec.interruptores?.length ?? 0); ++i) itens.push('chave');
        for (let i = 0; i < (sec.botoes?.length ?? 0); ++i) itens.push('botao');
    }
    return itens;
}
