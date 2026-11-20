import type { HTMLAttributes } from 'react';
import { TabButton } from './TabButton';
import { PilotoToggle } from './PilotoToggle';
import type { ModoPainel } from './tipos';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
    titulos: string[];
    /** Índice da aba destacada, ou -1 se nenhuma. */
    ativa: number;
    modo: ModoPainel;
    config: { pilotoAutomaticoOn: boolean };
    onSelecionar: (indice: number) => void;
    onAlterado: () => void;
    /** navegação por teclado: índice do botão com o cursor (-1 = nenhum; titulos.length = o do piloto automático) */
    cursor?: number;
    /** muda a cada L no botão do piloto automático */
    acionarPiloto?: number;
}

export function TabMenu({ titulos, ativa, modo, config, onSelecionar, onAlterado, cursor = -1, acionarPiloto = 0, ...divProps }: Props) {
    return (
        <div {...divProps}>
            {titulos.map((t, i) => (
                <TabButton key={t} texto={t} modo={modo} ativo={i === ativa} cursor={i === cursor} onClick={() => onSelecionar(i)} />
            ))}
            <PilotoToggle config={config} modo={modo} onAlterado={onAlterado} cursor={cursor === titulos.length} acionar={acionarPiloto} />
        </div>
    );
}
