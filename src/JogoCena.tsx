import { useEffect, useRef, useState } from 'react';
import { Jogo } from './Jogo';
import { TouchHUD } from './TouchHUDController';
import './TouchHUD.css';

export const isMobileDevice = () => 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || window.innerWidth <= 800;

export default function JogoCena() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const uiRef = useRef<HTMLDivElement>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(isMobileDevice());

    useEffect(() => {
        const handleResize = () => setIsMobile(isMobileDevice());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        let jogo: Jogo | null = null;
        let cancelado = false;

        try {
            jogo = new Jogo(canvasRef.current!, uiRef.current!);
            jogo.iniciar().catch((e) => { if (!cancelado) setErro(String(e?.message ?? e)); });
            if (isMobile) TouchHUD.iniciar();
        } catch (e: any) {
            setErro(String(e?.message ?? e));
        }

        return () => { 
            cancelado = true; 
            jogo?.dispose(); 
            TouchHUD.parar();
        };
    }, [isMobile]);

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#ccd9e6', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            
            <div ref={uiRef} className={isMobile ? 'mobile-mode' : ''} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
            
            {isMobile && (
                <div id="hud-main-container" className="hud-container">
                    
                    <div className="driving-controls">
                        <div className="hud-left">
                            <div className="hud-btn" id="btn-left">
                                <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                            </div>
                            <div className="hud-btn" id="btn-right">
                                <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                            </div>
                        </div>

                        <div className="hud-right">
                            <div className="hud-btn" id="btn-drift">
                                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z"/></svg>
                            </div>
                            <div className="hud-btn" id="btn-jump">
                                <svg viewBox="0 0 24 24"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>
                            </div>
                            <div className="hud-btn" id="btn-backward">
                                <svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
                            </div>
                            <div className="hud-btn" id="btn-forward">
                                <svg viewBox="0 0 24 24"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41-1.41z"/></svg>
                            </div>
                        </div>
                    </div>

                    <div className="hud-center">
                        <div className="hud-btn" id="btn-config-toggle">
                            <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.73 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                        </div>
                    </div>
                </div>
            )}
            {erro && <div style={{ position: 'absolute', left: 12, top: 12, color: '#b00020', font: '14px monospace' }}>Erro: {erro}</div>}
        </div>
    );
}