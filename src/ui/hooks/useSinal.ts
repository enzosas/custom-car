import { useEffect, useRef, type RefObject } from 'react';

/**
 * Chama `fn` quando `seq` muda (e só então), se `ativo`. Serve para "comandos" vindos de cima, como as teclas da
 * navegação: o componente que nasce com um `seq` já alto não dispara nada ao montar.
 */
export function useSinal(seq: number, ativo: boolean, fn: () => void) {
    const anterior = useRef(seq);
    const ultimaFn = useRef(fn);
    ultimaFn.current = fn;
    useEffect(() => {
        if (seq === anterior.current) return;
        anterior.current = seq;
        if (ativo) ultimaFn.current();
    }, [seq, ativo]);
}

/** rola o elemento para ficar visível quando `ativo` liga (o cursor do teclado chegou nele) */
export function useRolarAte(ref: RefObject<HTMLElement | null>, ativo: boolean) {
    useEffect(() => {
        if (ativo) ref.current?.scrollIntoView({ block: 'nearest' });
    }, [ativo, ref]);
}
