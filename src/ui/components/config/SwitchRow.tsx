import { useReducer } from 'react';
import type { ModoPainel } from './tipos';

interface Props {
    rotulo: string;
    /** Objeto do GAME_CONFIG que contém a flag (mutado diretamente, como no DraggableField). */
    objeto: Record<string, boolean>;
    chave: string;
    modo: ModoPainel;
    onAlterado: () => void;
}

/**
 * Interruptor liga/desliga genérico: serve para qualquer flag booleana do GAME_CONFIG.
 * <div role="switch"> de propósito (como o TabButton): um <button> focado reagiria à tecla Espaço,
 * que o jogo usa como freio de mão.
 */
export function SwitchRow({ rotulo, objeto, chave, modo, onAlterado }: Props) {
    const [, redesenhar] = useReducer((n: number) => n + 1, 0);
    const ligado = !!objeto[chave];

    const alternar = () => {
        objeto[chave] = !objeto[chave];
        redesenhar();
        onAlterado();
    };

    return (
        <div
            role="switch"
            aria-checked={ligado}
            aria-label={rotulo}
            className={`painel-switch ${modo}${ligado ? ' ligado' : ''}`}
            onClick={alternar}
        >
            <span>{rotulo}</span>
            <span className="trilho" />
        </div>
    );
}
