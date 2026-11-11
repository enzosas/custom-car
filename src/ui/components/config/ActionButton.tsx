import type { ModoPainel } from './tipos';

interface Props {
    rotulo: string;
    modo: ModoPainel;
    onClick: () => void;
}

/**
 * Botão de ação do painel (ex.: "nova seed"): vidro como as abas.
 * <div role="button"> de propósito (como o TabButton): um <button> focado reagiria à tecla Espaço,
 * que o jogo usa como freio de mão.
 */
export function ActionButton({ rotulo, modo, onClick }: Props) {
    return (
        <div role="button" className={`glass-panel painel-btn acao ${modo}`} onClick={onClick}>
            <div className="rotulo">{rotulo}</div>
        </div>
    );
}