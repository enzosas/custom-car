import { useRef, useState, type ReactNode, type SyntheticEvent } from 'react';

interface Props {
    /** Classe de posicionamento no grid (ex.: "hud-btn--left"). */
    className: string;
    /** Chamado ao pressionar (true) e ao soltar/cancelar/sair (false). */
    onChange: (pressionado: boolean) => void;
    children: ReactNode;
}

/** Botão circular do HUD. Só o estado visual é React; o efeito no jogo vai pelo callback. */
export function HudButton({ className, onChange, children }: Props) {
    const [ativo, setAtivo] = useState(false);
    const pressionado = useRef(false);

    const definir = (v: boolean) => {
        if (pressionado.current === v) return; // pointerup + pointerleave chegam em sequência
        pressionado.current = v;
        setAtivo(v);
        onChange(v);
    };

    const soltar = (e: SyntheticEvent) => { e.preventDefault(); definir(false); };

    return (
        <div
            className={`hud-btn ${className}${ativo ? ' active' : ''}`}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => { e.preventDefault(); definir(true); }}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            onPointerLeave={soltar}
        >
            {children}
        </div>
    );
}
