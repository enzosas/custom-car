import { useMemo, useReducer, useRef } from 'react';
import type { CampoDef } from '../../painelCampos';
import { useDragValue } from '../../hooks/useDragValue';
import { arrastar, formatarValor, iniciarSessao, type Alvo, type SessaoArrasto } from '../../lib/propriedade';
import type { ModoPainel } from './tipos';

interface Props {
    def: CampoDef;
    /** Objeto do GAME_CONFIG que contém o campo (mutado diretamente, como antes). */
    objeto: Record<string, number>;
    modo: ModoPainel;
    onAlterado: () => void;
}

export function DraggableField({ def, objeto, modo, onAlterado }: Props) {
    const alvo = useMemo<Alvo>(
        () => ({
            obj: objeto, chave: def.nome, tipo: def.tipo, fator: def.fator,
            passo: def.passo, min: def.min, max: def.max, ciclico: def.ciclico,
        }),
        [objeto, def],
    );
    const sessao = useRef<SessaoArrasto | null>(null);
    const [, redesenhar] = useReducer((n: number) => n + 1, 0);

    const { arrastando, handlers } = useDragValue({
        aoComecar: () => { sessao.current = iniciarSessao(alvo); },
        aoArrastar: (dx, acelerado) => {
            if (!sessao.current) return;
            arrastar(alvo, sessao.current, dx, acelerado);
            redesenhar();
            onAlterado();
        },
    });

    return (
        <div className={`painel-item ${modo}${arrastando ? ' dragging' : ''}`} {...handlers}>
            {`${def.nome}: ${formatarValor(alvo)}`}
        </div>
    );
}
