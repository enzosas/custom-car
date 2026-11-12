import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { JogoStats } from '@/core/Jogo';
import type { JogoRef } from '../hooks/useJogo';

interface Props {
    stats: JogoStats | null;
    jogoRef: JogoRef;
}

/** teclas e comandos do jogo: [tecla, o que faz] */
const TECLAS: [string, string][] = [
    ['Q', 'wireframe'],
    ['R', 'voltar para a pista'],
    ['SHIFT', 'agachar/pular'],
    ['ESPAÇO', 'freio de mão'],
    ['botão direito', 'câmara'],
    ['roda', 'zoom'],
];

/**
 * Botão "?" no canto superior direito (só desktop). Ao clicar, o círculo cresce até virar um cartão com as teclas,
 * a seed e o fps; clicar de novo, apertar Esc ou clicar fora (botão esquerdo) fecha. O jogo segue rodando por trás.
 */
export function HudInfo({ stats, jogoRef }: Props) {
    const [aberto, setAberto] = useState(false);
    const raiz = useRef<HTMLDivElement>(null);

    const carro = stats?.modoCarroGLB ? 'GLB' : 'Vermelho';
    const seed = stats?.seed ?? 0;
    const fps = (stats?.fps ?? 0).toFixed(0);
    const linhas: [string, string][] = [...TECLAS, ['X', `alternar carro (${carro})`]];

    // fecha com Esc ou ao clicar fora; o botão direito (câmera) não fecha, para dar para consultar as teclas dirigindo
    useEffect(() => {
        if (!aberto) return;
        const fora = (e: PointerEvent) => {
            if (e.button === 0 && !raiz.current?.contains(e.target as Node)) setAberto(false);
        };
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
        window.addEventListener('pointerdown', fora);
        window.addEventListener('keydown', tecla);
        return () => {
            window.removeEventListener('pointerdown', fora);
            window.removeEventListener('keydown', tecla);
        };
    }, [aberto]);

    // ponteiro sobre o HUD: o motor não orbita a câmera nem inicia o pulo por baixo dele (igual ao painel de config)
    const sobreUI = (v: boolean) => jogoRef.current?.setMouseSobreUI(v);
    useEffect(() => () => { jogoRef.current?.setMouseSobreUI(false); }, [jogoRef]);

    return (
        <div
            ref={raiz}
            className={`glass-panel hud-ajuda${aberto ? ' open' : ''}`}
            onPointerEnter={() => sobreUI(true)}
            onPointerLeave={() => sobreUI(false)}
        >
            <div className="hud-ajuda-cab">
                <div className="hud-ajuda-titulo">controles</div>
                {/* <div role="button" de propósito (como as abas): um <button> focado reagiria à tecla Espaço, o freio de mão */}
                <div
                    role="button"
                    aria-label="Controles e informações"
                    aria-expanded={aberto}
                    className="hud-ajuda-btn"
                    onClick={() => setAberto((a) => !a)}
                >
                    <span className="q1">?</span>
                    <span className="q2">✕</span>
                </div>
            </div>
            {/* o corpo cresce de 0 até a altura do conteúdo (grid 0fr -> 1fr): adicionar uma tecla não exige mexer em altura nenhuma */}
            <div className="hud-ajuda-corpo" aria-hidden={!aberto}>
                <div className="hud-ajuda-lista">
                    <div className="hud-ajuda-itens">
                        {linhas.map(([tecla, descricao], i) => (
                            <div key={tecla} className="hud-ajuda-linha" style={{ '--i': i } as CSSProperties}>
                                <span className="tecla">{tecla}</span>
                                <span>{descricao}</span>
                            </div>
                        ))}
                        <div className="hud-ajuda-linha info" style={{ '--i': linhas.length } as CSSProperties}>
                            <span>{`seed ${seed}`}</span>
                            <span>{`${fps} fps`}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}