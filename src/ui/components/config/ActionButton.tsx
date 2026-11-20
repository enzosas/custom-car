import { useRef } from 'react';
import type { ModoPainel } from './tipos';
import { useRolarAte, useSinal } from '../../hooks/useSinal';

interface Props {
    rotulo: string;
    modo: ModoPainel;
    onClick: () => void;
    /** cursor do teclado neste botão; `acionar` muda a cada L */
    cursor?: boolean;
    acionar?: number;
}

/**
 * Botão de ação do painel (ex.: "nova seed"): vidro como as abas.
 * <div role="button"> de propósito (como o TabButton): um <button> focado reagiria à tecla Espaço,
 * que o jogo usa como freio de mão.
 */
export function ActionButton({ rotulo, modo, onClick, cursor = false, acionar = 0 }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    useRolarAte(ref, cursor);
    useSinal(acionar, cursor, onClick);
    return (
        <div ref={ref} role="button" className={`glass-panel painel-btn acao ${modo}${cursor ? ' nav-cursor' : ''}`} onClick={onClick}>
            <div className="rotulo">{rotulo}</div>
        </div>
    );
}