// useDragValue.ts - Captura de Pointer Events
import { useRef, useState, type PointerEvent } from 'react';

const LIMIAR_PX = 5; // zona de intenção: abaixo disso ainda não sabemos se é arrasto ou scroll

interface Opcoes {
    /** Pressionou o campo (ainda pode virar scroll). */
    aoComecar: () => void;
    /** Arrasto horizontal confirmado: deslocamento em px desde o último evento. */
    aoArrastar: (deltaX: number, acelerado: boolean, precisao: boolean) => void;
}

/**
 * Arrasto horizontal para alterar um valor, via Pointer Events.
 */
export function useDragValue(opcoes: Opcoes) {
    const [arrastando, setArrastando] = useState(false);
    const op = useRef(opcoes);
    op.current = opcoes;

    const e = useRef({ ativo: false, confirmado: false, id: -1, x0: 0, y0: 0, xAnterior: 0 });

    const terminar = () => {
        e.current.ativo = false;
        e.current.confirmado = false;
        setArrastando(false);
    };

    const onPointerDown = (ev: PointerEvent<HTMLElement>) => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        e.current = { ativo: true, confirmado: false, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, xAnterior: ev.clientX };
        if (ev.pointerType === 'mouse') ev.currentTarget.setPointerCapture(ev.pointerId);
        op.current.aoComecar();
    };

    const onPointerMove = (ev: PointerEvent<HTMLElement>) => {
        const s = e.current;
        if (!s.ativo || ev.pointerId !== s.id) return;

        if (!s.confirmado) {
            const dx = Math.abs(ev.clientX - s.x0);
            const dy = Math.abs(ev.clientY - s.y0);
            if (dx > LIMIAR_PX && dx >= dy) {
                s.confirmado = true;
                s.xAnterior = ev.clientX;
                setArrastando(true);
            }
            return;
        }

        const delta = ev.clientX - s.xAnterior;
        if (delta !== 0) {
            s.xAnterior = ev.clientX;
            // Passa os modificadores: Shift (acelerado), Alt (precisao)
            op.current.aoArrastar(delta, ev.shiftKey, ev.altKey);
        }
    };

    const onPointerUp = (ev: PointerEvent<HTMLElement>) => {
        if (ev.pointerId === e.current.id) terminar();
    };

    return {
        arrastando,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            onLostPointerCapture: onPointerUp,
        },
    };
}