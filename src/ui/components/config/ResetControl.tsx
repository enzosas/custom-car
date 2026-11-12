import type { ModoPainel } from './tipos';

interface Props {
    ativo: boolean;
    /** quantas configs da aba atual estão alteradas (só é mostrado com o modo ativo) */
    contador: number;
    modo: ModoPainel;
    onAlternar: () => void;
    onResetarTudo: () => void;
}

/**
 * Controle do modo "resetar configs". Fica dentro da linha do título da primeira seção (ver SectionHeader),
 * à direita: é um item comum do layout e rola junto com a lista.
 * Inativo: só o ↺. Ativo: o ↺ gira e vira ✕ (sair) e o chip "resetar tudo" abre espaço à esquerda dele.
 * <div role="button"> de propósito (como o TabButton): um <button> focado reagiria à tecla Espaço, que o jogo usa como freio de mão.
 */
export function ResetControl({ ativo, contador, modo, onAlternar, onResetarTudo }: Props) {
    const vazio = contador === 0;
    return (
        <div className={`reset-ctl ${modo}${ativo ? ' on' : ''}`}>
            <div
                role="button" aria-disabled={vazio}
                className={`reset-chip${vazio ? ' vazio' : ''}`}
                onClick={() => { if (ativo && !vazio) onResetarTudo(); }}
            >
                {`resetar tudo${contador > 0 ? ` (${contador})` : ''}`}
            </div>
            <div
                role="button" aria-pressed={ativo}
                aria-label={ativo ? 'sair do modo resetar' : 'resetar configs'}
                className="reset-ic" onClick={onAlternar}
            >
                <span className="r">↺</span>
                <span className="k">✕</span>
            </div>
        </div>
    );
}
