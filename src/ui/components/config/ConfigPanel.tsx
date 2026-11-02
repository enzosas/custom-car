import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { GAME_CONFIG } from '@/core/config';
import { ABAS } from '../../painelCampos';
import type { JogoRef } from '../../hooks/useJogo';
import { TabMenu } from './TabMenu';
import { FieldList } from './FieldList';

interface Props {
    jogoRef: JogoRef;
    isMobile: boolean;
    /** Mobile: aberto pela engrenagem do HUD. No desktop é ignorado (estado interno). */
    abertoMobile: boolean;
    /** Incrementa quando o motor altera o config sozinho (ex.: troca de carro). */
    revisao: number;
}

const titulos = ABAS.map((a) => a.titulo);

function ConfigPanelBase({ jogoRef, isMobile, abertoMobile, revisao }: Props) {
    const [abaAtiva, setAbaAtiva] = useState(0);
    const [abertoDesktop, setAbertoDesktop] = useState(false);
    const colunaRef = useRef<HTMLDivElement>(null);
    const hover = useRef({ menu: false, painel: false });

    const modo = isMobile ? 'mobile' : 'desktop';
    const aberto = isMobile ? abertoMobile : abertoDesktop;

    const aoAlterar = useCallback(() => jogoRef.current?.marcarConfigAlterada(), [jogoRef]);

    // --- ponteiro sobre a UI (desktop): evita orbitar a câmera / iniciar pulo por baixo do painel ---
    const sincronizarHover = useCallback(() => {
        jogoRef.current?.setMouseSobreUI(hover.current.menu || hover.current.painel);
    }, [jogoRef]);

    const regiao = (nome: 'menu' | 'painel') => ({
        onPointerEnter: () => { hover.current[nome] = true; sincronizarHover(); },
        onPointerLeave: () => { hover.current[nome] = false; sincronizarHover(); },
    });

    useEffect(() => {
        if (!abertoDesktop) { hover.current.painel = false; sincronizarHover(); }
    }, [abertoDesktop, sincronizarHover]);

    useEffect(() => () => {
        hover.current = { menu: false, painel: false };
        jogoRef.current?.setMouseSobreUI(false);
    }, [jogoRef]);

    // --- seleção de aba ---
    const selecionar = (i: number) => {
        if (isMobile) { setAbaAtiva(i); return; }
        if (abertoDesktop && abaAtiva === i) { setAbertoDesktop(false); return; }
        setAbertoDesktop(true);
        setAbaAtiva(i);
    };

    useEffect(() => { colunaRef.current?.scrollTo({ top: 0 }); }, [abaAtiva]);

    // key força os campos a relerem o GAME_CONFIG ao trocar de aba ou quando o motor o altera
    const campos = (
        <FieldList key={`${abaAtiva}-${revisao}`} aba={ABAS[abaAtiva]} config={GAME_CONFIG} modo={modo} onAlterado={aoAlterar} />
    );

    if (isMobile) {
        return (
            // "painel-config-root" também é usado pelo Input.ts para liberar o scroll nativo
            <div className={`painel-config-root${aberto ? ' open' : ''}`}>
                <TabMenu
                    className="painel-col-menu"
                    titulos={titulos} ativa={abaAtiva} modo={modo} config={GAME_CONFIG}
                    onSelecionar={selecionar} onAlterado={aoAlterar}
                />
                <div ref={colunaRef} className="painel-col-sliders glass-panel">{campos}</div>
                <div className="painel-col-vazia" />
            </div>
        );
    }

    return (
        <div className="painel-desktop-root">
            <TabMenu
                className="painel-menu-desktop" {...regiao('menu')}
                titulos={titulos} ativa={abertoDesktop ? abaAtiva : -1} modo={modo} config={GAME_CONFIG}
                onSelecionar={selecionar} onAlterado={aoAlterar}
            />
            <div
                ref={colunaRef}
                className={`painel-desktop-fundo glass-panel${abertoDesktop ? ' open' : ''}`}
                {...regiao('painel')}
            >
                {campos}
            </div>
        </div>
    );
}

export const ConfigPanel = memo(ConfigPanelBase);
