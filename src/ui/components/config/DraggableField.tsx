// DraggableField.tsx
import { useMemo, useReducer, useRef } from 'react';
import type { CampoDef } from '../../painelCampos';
import { useDragValue } from '../../hooks/useDragValue';
import { arrastar, formatarValor, iniciarSessao, type Alvo, type SessaoArrasto } from '../../lib/propriedade';
import { foiAlterado, idItem, valorPadrao } from '../../lib/padroes';
import type { ModoPainel } from './tipos';

interface Props {
    def: CampoDef;
    objeto: Record<string, number>;
    /** caminho da seção dentro do GAME_CONFIG; usado para achar o valor padrão do campo (sensibilidade do arrasto) */
    caminho: string[];
    modo: ModoPainel;
    onAlterado: () => void;
    /** o GAME_CONFIG só recebe o valor ao soltar o arrasto; enquanto arrasta, só o texto do campo muda */
    aplicarAoSoltar?: boolean;
    /** modo "resetar configs": clicar no campo alterado o devolve a `original` (o arrasto fica desativado) */
    modoReset?: boolean;
    original?: number;
    /** contador que sobe a cada reset do campo; reinicia o flash azul */
    flash?: number;
    onResetar?: (id: string) => void;
}

export function DraggableField({ def, objeto, caminho, modo, onAlterado, aplicarAoSoltar = false, modoReset = false, original, flash = 0, onResetar }: Props) {
    const chaveCaminho = caminho.join('.');

    // Rascunho usado nos campos "aplicar ao soltar": o arrasto altera ele, e não o GAME_CONFIG
    const rascunho = useRef<Record<string, number>>({ [def.nome]: objeto[def.nome] ?? 0 });

    const criarAlvo = (obj: Record<string, number>): Alvo => ({
        obj, chave: def.nome, tipo: def.tipo, min: def.min, max: def.max, ciclico: def.ciclico,
    });
    const alvoReal = useMemo(() => criarAlvo(objeto), [objeto, def]);               // eslint-disable-line react-hooks/exhaustive-deps
    const alvoRascunho = useMemo(() => criarAlvo(rascunho.current), [def]);         // eslint-disable-line react-hooks/exhaustive-deps
    const alvoArrasto = aplicarAoSoltar ? alvoRascunho : alvoReal;

    // Congela a sensibilidade pelo valor PADRÃO do campo (e não pelo atual)
    const passoBase = useMemo(() => {
        // Com limites (cor, porcentagens etc.): 300px varrem a faixa toda
        if (def.min !== undefined && def.max !== undefined) return (def.max - def.min) / 300;

        const ref = valorPadrao(caminho, def.nome) ?? objeto[def.nome] ?? 0;
        // Campos que começam em 0 não têm escala para inferir: passo fixo de 0.1 (inteiro, se for uint)
        if (ref === 0) return def.tipo === 'uint' ? 1 : 0.1;

        // Sem limite: inferência logarítmica pela ordem de grandeza do valor
        const ordem = Math.floor(Math.log10(Math.abs(ref)));
        let passo = Math.pow(10, Math.max(ordem - 2, -4));
        if (def.tipo === 'uint' && def.min === undefined) passo = Math.max(1, Math.round(passo));   // pulo inteiro
        return passo;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [def.min, def.max, def.tipo, def.nome, chaveCaminho]);   // 'objeto' fica de fora de propósito

    const sessao = useRef<SessaoArrasto | null>(null);
    const [, redesenhar] = useReducer((n: number) => n + 1, 0);

    const { arrastando, handlers } = useDragValue({
        aoComecar: () => {
            if (aplicarAoSoltar) rascunho.current[def.nome] = objeto[def.nome] ?? 0;
            sessao.current = iniciarSessao(alvoArrasto);
        },
        aoArrastar: (dx, acelerado, precisao) => {
            if (!sessao.current) return;
            arrastar(alvoArrasto, sessao.current, dx, acelerado, precisao, passoBase);
            redesenhar();
            if (!aplicarAoSoltar) onAlterado();
        },
        aoSoltar: () => {
            // arrasto confirmado e terminado: só agora o jogo recebe o valor
            if (aplicarAoSoltar) {
                objeto[def.nome] = rascunho.current[def.nome];
                redesenhar();
                onAlterado();
            }
            sessao.current = null;
        },
    });

    // Enquanto arrasta um campo "aplicar ao soltar", mostra o rascunho; fora disso, o valor real do config
    const alvoVisivel = aplicarAoSoltar && arrastando ? alvoRascunho : alvoReal;

    const alterado = modoReset && foiAlterado(objeto[def.nome], original);
    const aoClicarReset = () => {
        if (!alterado || original === undefined) return;
        objeto[def.nome] = original;
        onResetar?.(idItem(caminho, def.nome));
    };

    const classes = `painel-item campo ${modo}${arrastando ? ' dragging' : ''}`
        + (modoReset ? (alterado ? ' reset-alt' : ' reset-ina') : '')
        + (flash > 0 ? (flash % 2 ? ' flash-a' : ' flash-b') : '');

    return (
        <div className={classes} {...(modoReset ? { onClick: aoClicarReset } : handlers)}>
            <span className="painel-rotulo">{def.apresentacao ?? def.nome}</span>
            <span className="reset-marca">↺</span>
            <span className="painel-celula">{formatarValor(alvoVisivel)}</span>
        </div>
    );
}