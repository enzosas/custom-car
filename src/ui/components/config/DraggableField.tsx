// DraggableField.tsx
import { useMemo, useReducer, useRef } from 'react';
import type { CampoDef } from '../../painelCampos';
import { useDragValue } from '../../hooks/useDragValue';
import { arrastar, formatarValor, iniciarSessao, type Alvo, type SessaoArrasto } from '../../lib/propriedade';
import type { ModoPainel } from './tipos';

interface Props {
    def: CampoDef;
    objeto: Record<string, number>;
    modo: ModoPainel;
    onAlterado: () => void;
}

export function DraggableField({ def, objeto, modo, onAlterado }: Props) {
    const alvo = useMemo<Alvo>(
        () => ({
            obj: objeto,
            chave: def.nome,
            tipo: def.tipo,
            min: def.min,
            max: def.max,
            ciclico: def.ciclico,
        }),
        [objeto, def],
    );

    // Congela a sensibilidade na renderização inicial do campo
    const passoBase = useMemo(() => {
        // Inferência direta por Limites (cor/porcentagens etc)
        if (def.min !== undefined && def.max !== undefined) {
            return (def.max - def.min) / 300; // 300px varre a barra toda
        }

        // Inferência logarítmica para campos sem limite (protegido contra undefined com ?? 0)
        const valorInicial = Math.abs(objeto[def.nome] ?? 0);
        const ref = valorInicial === 0 ? (def.tipo === 'uint' ? 1 : 0.01) : valorInicial;
        const ordem = Math.floor(Math.log10(ref));

        let passo = Math.pow(10, Math.max(ordem - 2, -4));
        if (def.tipo === 'uint' && def.min === undefined) {
            passo = Math.max(1, Math.round(passo)); // Garante pulo inteiro
        }
        return passo;

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [def.min, def.max, def.tipo, def.nome]); // Ignoramos 'objeto' propositalmente para não re-renderizar passo

    const sessao = useRef<SessaoArrasto | null>(null);
    const [, redesenhar] = useReducer((n: number) => n + 1, 0);

    const { arrastando, handlers } = useDragValue({
        aoComecar: () => { sessao.current = iniciarSessao(alvo); },
        aoArrastar: (dx, acelerado, precisao) => {
            if (!sessao.current) return;
            arrastar(alvo, sessao.current, dx, acelerado, precisao, passoBase);
            redesenhar();
            onAlterado();
        },
    });

    // Fundo visual (barra de progresso) para campos delimitados
    let style = {};
    if (def.min !== undefined && def.max !== undefined && !def.ciclico) {
        const range = def.max - def.min;
        const valAtual = objeto[def.nome] ?? 0;
        const percentage = Math.max(0, Math.min(100, ((valAtual - def.min) / range) * 100));
        style = {
            background: `linear-gradient(to right, rgba(0, 85, 170, 0.15) ${percentage}%, transparent ${percentage}%)`
        };
    }

    return (
        <div className={`painel-item ${modo}${arrastando ? ' dragging' : ''}`} style={style} {...handlers}>
            {`${def.nome}: ${formatarValor(alvo)}`}
        </div>
    );
}