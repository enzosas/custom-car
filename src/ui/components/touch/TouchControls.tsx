import type { ControlesToque } from '@/core/ControlesToque';
import { HudButton } from './HudButton';
import {
    IconeConfig, IconeDireita, IconeDrift, IconeEsquerda, IconeFrente, IconePulo, IconeTras,
} from './icons';

interface Props {
    controles: ControlesToque;
    configAberto: boolean;
    onAlternarConfig: () => void;
}

export function TouchControls({ controles, configAberto, onAlternarConfig }: Props) {
    return (
        <div className={`hud-container${configAberto ? ' config-active' : ''}`}>
            <div className="driving-controls">
                <div className="hud-left">
                    <HudButton className="hud-btn--left" onChange={(p) => { controles.left = p; }}><IconeEsquerda /></HudButton>
                    <HudButton className="hud-btn--right" onChange={(p) => { controles.right = p; }}><IconeDireita /></HudButton>
                </div>
                <div className="hud-right">
                    <HudButton className="hud-btn--drift" onChange={(p) => { controles.drift = p; }}><IconeDrift /></HudButton>
                    <HudButton className="hud-btn--jump" onChange={(p) => { controles.jump = p; }}><IconePulo /></HudButton>
                    <HudButton className="hud-btn--backward" onChange={(p) => { controles.backward = p; }}><IconeTras /></HudButton>
                    <HudButton className="hud-btn--forward" onChange={(p) => { controles.forward = p; }}><IconeFrente /></HudButton>
                </div>
            </div>
            <div className="hud-center">
                <HudButton className="hud-btn--config" onChange={(p) => { if (p) onAlternarConfig(); }}>
                    <IconeConfig />
                </HudButton>
            </div>
        </div>
    );
}
