import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GAME_CONFIG } from '@/core/config';
import { ABAS } from '../../painelCampos';
import type { JogoRef } from '../../hooks/useJogo';
import { TabMenu } from './TabMenu';
import { FieldList } from './FieldList';
import { ResetControl } from './ResetControl';
import { itensAlterados } from '../../lib/padroes';
import type { AcoesPainel } from './tipos';
import { itensNavegaveis, type NivelNav, type NavLista, type PassoNav } from '../../lib/navegacao';

/** teclas da navegação (pela posição física, como WASD): I/K = cima/baixo, L = entrar/acionar, J = voltar */
const TECLAS_NAV: Record<string, 'i' | 'j' | 'k' | 'l'> = { KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l' };

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

    // modo "resetar configs": clicar num valor alterado o devolve ao original; "resetar tudo" vale para a aba atual
    const [modoReset, setModoReset] = useState(false);
    const [sinalResetarTudo, setSinalResetarTudo] = useState(0);
    const [, atualizarContador] = useState(0);
    const modoResetRef = useRef(false);
    modoResetRef.current = modoReset;
    const contadorExibido = useRef(0);

    // fechar o painel desfaz o modo
    useEffect(() => { if (!aberto) setModoReset(false); }, [aberto]);

    const aoAlterar = useCallback(() => {
        jogoRef.current?.marcarConfigAlterada();
        // com o modo ativo, o contador do chip acompanha cada valor devolvido ao original
        if (modoResetRef.current) atualizarContador((n) => n + 1);
    }, [jogoRef]);

    // o que os botões do painel podem pedir ao motor (ver painelCampos.ts: BotaoDef)
    const acoes = useMemo<AcoesPainel>(() => ({
        novaSeed: () => { jogoRef.current?.reiniciarSeed(); },
        lerSeed: () => jogoRef.current?.getSeed() ?? null,
        carroGLB: () => jogoRef.current?.getModoCarroGLB() ?? false,
    }), [jogoRef]);

    const contador = modoReset ? itensAlterados(ABAS[abaAtiva], GAME_CONFIG, acoes.carroGLB()).length : 0;
    // enquanto o chip desliza para fora, mantém o último número (senão ele piscaria sem o contador)
    if (modoReset) contadorExibido.current = contador;

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

    // --- navegação por teclado (I J K L), só no desktop; ver lib/navegacao.ts ---
    const [nivel, setNivel] = useState<NivelNav>('oculto');
    const [botaoNav, setBotaoNav] = useState(0);          // 0..titulos.length-1 = abas; titulos.length = piloto automático
    const [itemNav, setItemNav] = useState(0);
    const [passoNav, setPassoNav] = useState<PassoNav>({ seq: 0, dir: 1, rapido: false });
    const [acionarNav, setAcionarNav] = useState(0);
    const [acionarPiloto, setAcionarPiloto] = useState(0);

    // o mouse também mexe no painel: fechar a aba tira o cursor de dentro dela; trocar de aba leva o cursor ao 1º item
    useEffect(() => {
        if (!abertoDesktop && (nivel === 'janela' || nivel === 'campo')) { setNivel('botoes'); setBotaoNav(abaAtiva); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abertoDesktop]);
    useEffect(() => {
        setItemNav(0);
        if (nivel === 'campo') setNivel('janela');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abaAtiva]);

    const estadoNav = useRef({ nivel, botaoNav, itemNav, abaAtiva, abertoDesktop });
    estadoNav.current = { nivel, botaoNav, itemNav, abaAtiva, abertoDesktop };

    useEffect(() => {
        if (isMobile) { setNivel('oculto'); return; }
        const totalBotoes = titulos.length + 1;
        const aoTeclar = (e: KeyboardEvent) => {
            const t = TECLAS_NAV[e.code];
            if (!t || e.ctrlKey || e.metaKey || e.altKey) return;
            const alvo = e.target as HTMLElement | null;
            if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
            e.preventDefault();
            const s = estadoNav.current;

            if (s.nivel === 'oculto') {
                if (t !== 'j') setNivel('botoes');
            } else if (s.nivel === 'botoes') {
                if (t === 'i') setBotaoNav((s.botaoNav - 1 + totalBotoes) % totalBotoes);
                else if (t === 'k') setBotaoNav((s.botaoNav + 1) % totalBotoes);
                else if (t === 'j') setNivel('oculto');
                else if (s.botaoNav === titulos.length) setAcionarPiloto((n) => n + 1);   // L no piloto: liga/desliga
                else {                                                                    // L numa aba: abre e entra
                    setAbaAtiva(s.botaoNav);
                    setAbertoDesktop(true);
                    setItemNav(0);
                    setNivel(itensNavegaveis(ABAS[s.botaoNav]).length > 0 ? 'janela' : 'botoes');
                }
            } else if (s.nivel === 'janela') {
                const itens = itensNavegaveis(ABAS[s.abaAtiva]);
                if (t === 'i') setItemNav((s.itemNav - 1 + itens.length) % itens.length);
                else if (t === 'k') setItemNav((s.itemNav + 1) % itens.length);
                else if (t === 'j') { setAbertoDesktop(false); setBotaoNav(s.abaAtiva); setNivel('botoes'); }
                else if (itens[s.itemNav] === 'campo') setNivel('campo');               // L num campo: seleciona
                else setAcionarNav((n) => n + 1);                                       // L no resto: aciona
            } else {
                if (t === 'i' || t === 'k') setPassoNav((p) => ({ seq: p.seq + 1, dir: t === 'i' ? 1 : -1, rapido: e.shiftKey }));
                else if (t === 'j') setNivel('janela');
            }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [isMobile]);

    const navLista: NavLista | null = !isMobile && abertoDesktop && (nivel === 'janela' || nivel === 'campo')
        ? { item: itemNav, selecionado: nivel === 'campo', passo: passoNav, acionar: acionarNav }
        : null;

    // o controle do modo "resetar configs" vai dentro do cabeçalho da primeira seção (ver FieldList), então rola com a lista
    // "resetar tudo" restaura a aba atual e desativa o modo
    const controleReset = (
        <ResetControl
            ativo={modoReset} contador={contadorExibido.current} modo={modo}
            onAlternar={() => setModoReset((v) => !v)}
            onResetarTudo={() => { setSinalResetarTudo((s) => s + 1); setModoReset(false); }}
        />
    );

    // key força os campos a relerem o GAME_CONFIG ao trocar de aba ou quando o motor o altera
    const campos = (
        <FieldList
            key={`${abaAtiva}-${revisao}`} aba={ABAS[abaAtiva]} config={GAME_CONFIG} modo={modo} acoes={acoes} onAlterado={aoAlterar}
            modoReset={modoReset} sinalResetarTudo={sinalResetarTudo} acaoCabecalho={controleReset}
            nav={navLista}
        />
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
                <div ref={colunaRef} className={`painel-col-sliders glass-panel${modoReset ? ' reset-ativo' : ''}`}>{campos}</div>
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
                cursor={nivel === 'botoes' ? botaoNav : -1} acionarPiloto={acionarPiloto}
            />
            <div
                ref={colunaRef}
                className={`painel-desktop-fundo glass-panel${abertoDesktop ? ' open' : ''}${modoReset ? ' reset-ativo' : ''}`}
                {...regiao('painel')}
            >
                {campos}
            </div>
        </div>
    );
}

export const ConfigPanel = memo(ConfigPanelBase);