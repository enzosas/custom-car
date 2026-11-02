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
}

export function TabMenu({ titulos, ativa, modo, config, onSelecionar, onAlterado, ...divProps }: Props) {
    return (
        <div {...divProps}>
            {titulos.map((t, i) => (
                <TabButton key={t} texto={t} modo={modo} ativo={i === ativa} onClick={() => onSelecionar(i)} />
            ))}
            <PilotoToggle config={config} modo={modo} onAlterado={onAlterado} />
        </div>
    );
}
