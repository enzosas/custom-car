import { useRef } from 'react';
import type { ModoPainel } from './tipos';
import { useRolarAte } from '../../hooks/useSinal';

interface Props {
    texto: string;
    modo: ModoPainel;
    ativo?: boolean;
    /** o cursor da navegação por teclado (I J K L) está neste botão */
    cursor?: boolean;
    onClick: () => void;
}

/**
 * <div role="button"> de propósito: um <button> focado reagiria à tecla Espaço,
 * que o jogo usa como freio de mão.
 */
export function TabButton({ texto, modo, ativo = false, cursor = false, onClick }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    useRolarAte(ref, cursor);
    return (
        <div
            ref={ref}
            role="button"
            aria-pressed={ativo}
            className={`glass-panel painel-btn ${modo}${ativo ? ' active-tab' : ''}${cursor ? ' nav-cursor' : ''}`}
            onClick={onClick}
        >
            <div className="rotulo">{texto}</div>
        </div>
    );
}
