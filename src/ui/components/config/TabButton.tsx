import type { ModoPainel } from './tipos';

interface Props {
    texto: string;
    modo: ModoPainel;
    ativo?: boolean;
    onClick: () => void;
}

/**
 * <div role="button"> de propósito: um <button> focado reagiria à tecla Espaço,
 * que o jogo usa como freio de mão.
 */
export function TabButton({ texto, modo, ativo = false, onClick }: Props) {
    return (
        <div
            role="button"
            aria-pressed={ativo}
            className={`glass-panel painel-btn ${modo}${ativo ? ' active-tab' : ''}`}
            onClick={onClick}
        >
            <div className="rotulo">{texto}</div>
        </div>
    );
}
