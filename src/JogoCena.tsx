// JogoCena.tsx — componente React que hospeda o canvas e o motor Jogo.ts
import { useEffect, useRef, useState } from 'react';
import { Jogo } from './Jogo';

export default function JogoCena() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const uiRef = useRef<HTMLDivElement>(null);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let jogo: Jogo | null = null;
        let cancelado = false;
        try {
            jogo = new Jogo(canvasRef.current!, uiRef.current!);
            jogo.iniciar().catch((e) => { if (!cancelado) setErro(String(e?.message ?? e)); });
        } catch (e: any) {
            setErro(String(e?.message ?? e));
        }
        return () => { cancelado = true; jogo?.dispose(); };
    }, []);

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#ccd9e6', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            <div ref={uiRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
            {erro && <div style={{ position: 'absolute', left: 12, top: 12, color: '#b00020', font: '14px monospace' }}>Erro: {erro}</div>}
        </div>
    );
}
