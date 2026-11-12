import { useEffect, useMemo, useRef, useState } from 'react';
import { criarControlesToque, resetarControlesToque } from '@/core/ControlesToque';
import { useIsMobile } from './hooks/useIsMobile';
import { useJogo } from './hooks/useJogo';
import { useGlbDrop } from './hooks/useGlbDrop';
import { HudInfo } from './components/HudInfo';
import { DropOverlay } from './components/DropOverlay';
import { ErrorMessage } from './components/ErrorMessage';
import { TouchControls } from './components/touch/TouchControls';
import { ConfigPanel } from './components/config/ConfigPanel';

import './styles/base.css';
import './styles/glass.css';
import './styles/touch.css';
import './styles/config.css';

export default function JogoCena() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const controlesToque = useMemo(criarControlesToque, []);
    const isMobile = useIsMobile();
    const [configAberto, setConfigAberto] = useState(false);

    const { jogoRef, erro, stats, revisaoConfig } = useJogo({ canvasRef, controlesToque });
    const drop = useGlbDrop((arquivo) => jogoRef.current?.carregarModeloGLBLocal(arquivo));

    // O motor precisa saber se o painel mobile está aberto (desloca a câmera para liberar espaço).
    useEffect(() => {
        jogoRef.current?.setConfigAberto(isMobile && configAberto);
    }, [jogoRef, isMobile, configAberto]);

    // Ao sair do modo mobile, solta botões presos e fecha o painel.
    useEffect(() => {
        if (isMobile) return;
        resetarControlesToque(controlesToque);
        setConfigAberto(false);
    }, [isMobile, controlesToque]);

    return (
        <div className="cena" {...drop.handlers}>
            <canvas ref={canvasRef} className="cena-canvas" />

            {!isMobile && <HudInfo stats={stats} jogoRef={jogoRef} />}

            <ConfigPanel
                jogoRef={jogoRef}
                isMobile={isMobile}
                abertoMobile={configAberto}
                revisao={revisaoConfig}
            />

            {isMobile && (
                <TouchControls
                    controles={controlesToque}
                    configAberto={configAberto}
                    onAlternarConfig={() => setConfigAberto((a) => !a)}
                />
            )}

            {drop.arrastando && <DropOverlay />}
            {erro && <ErrorMessage mensagem={erro} />}
        </div>
    );
}