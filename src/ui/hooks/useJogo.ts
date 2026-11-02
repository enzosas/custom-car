import { useEffect, useRef, useState } from 'react';
import { Jogo, type JogoStats } from '@/core/Jogo';
import type { ControlesToque } from '@/core/ControlesToque';

/** Referência somente-leitura ao motor; compatível com React 18 e 19. */
export type JogoRef = { readonly current: Jogo | null };

interface Args {
    canvasRef: { readonly current: HTMLCanvasElement | null };
    controlesToque: ControlesToque;
}

const mensagem = (e: unknown) => String((e as { message?: string } | null)?.message ?? e);

/**
 * Cria o motor uma única vez (e o destrói no unmount).
 * Expõe o que a UI precisa observar: erro, estatísticas do HUD e uma "revisão"
 * que incrementa sempre que o motor altera o GAME_CONFIG por conta própria.
 */
export function useJogo({ canvasRef, controlesToque }: Args) {
    const jogoRef = useRef<Jogo | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [stats, setStats] = useState<JogoStats | null>(null);
    const [revisaoConfig, setRevisaoConfig] = useState(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let cancelado = false;
        let jogo: Jogo;

        try {
            jogo = new Jogo(canvas, {
                controlesToque,
                onStats: (s) => { if (!cancelado) setStats(s); },
                onConfigRecarregada: () => { if (!cancelado) setRevisaoConfig((r) => r + 1); },
            });
        } catch (e) {
            setErro(mensagem(e));
            return;
        }

        jogoRef.current = jogo;
        jogo.iniciar().catch((e) => { if (!cancelado) setErro(mensagem(e)); });

        return () => {
            cancelado = true;
            jogo.dispose();
            if (jogoRef.current === jogo) jogoRef.current = null;
        };
    }, [canvasRef, controlesToque]);

    return { jogoRef, erro, stats, revisaoConfig };
}
