import { useReducer } from 'react';
import type { ModoPainel } from './tipos';

interface Props {
    rotulo: string;
    /** Objeto do GAME_CONFIG que contém a flag (mutado diretamente, como no DraggableField). */
    objeto: Record<string, boolean>;
    chave: string;
    modo: ModoPainel;
    onAlterado: () => void;
    /** modo "resetar configs": clicar no switch alterado o devolve a `original` */
    modoReset?: boolean;
    original?: boolean;
    id?: string;
    /** contador que sobe a cada reset do switch; reinicia o flash azul */
    flash?: number;
    onResetar?: (id: string) => void;
}

/**
 * Interruptor liga/desliga genérico: serve para qualquer flag booleana do GAME_CONFIG.
 * <div role="switch"> de propósito (como o TabButton): um <button> focado reagiria à tecla Espaço,
 * que o jogo usa como freio de mão.
 */
export function SwitchRow({ rotulo, objeto, chave, modo, onAlterado, modoReset = false, original, id = chave, flash = 0, onResetar }: Props) {
    const [, redesenhar] = useReducer((n: number) => n + 1, 0);
    const ligado = !!objeto[chave];

    const alterado = modoReset && original !== undefined && ligado !== original;

    const alternar = () => {
        if (modoReset) {
            if (!alterado || original === undefined) return;
            objeto[chave] = original;
            redesenhar();
            onResetar?.(id);   // quem recebe já avisa o motor
            return;
        }
        objeto[chave] = !objeto[chave];
        redesenhar();
        onAlterado();
    };

    const classes = `painel-switch ${modo}${ligado ? ' ligado' : ''}`
        + (modoReset ? (alterado ? ' reset-alt' : ' reset-ina') : '')
        + (flash > 0 ? (flash % 2 ? ' flash-a' : ' flash-b') : '');

    return (
        <div
            role="switch"
            aria-checked={ligado}
            aria-label={rotulo}
            className={classes}
            onClick={alternar}
        >
            <span className="painel-rotulo">{rotulo}</span>
            <span className="reset-marca">↺</span>
            <span className="trilho" />
        </div>
    );
}
