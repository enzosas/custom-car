import type { ReactNode } from 'react';
import type { ModoPainel } from './tipos';

interface Props {
    titulo: string;
    modo: ModoPainel;
    /** controle alinhado à direita do título (ex.: o ↺ do modo "resetar configs" na primeira seção); rola junto com a lista */
    acao?: ReactNode;
}

export function SectionHeader({ titulo, modo, acao }: Props) {
    return (
        <div className={`painel-item secao ${modo}`}>
            <span className="secao-titulo">{titulo}</span>
            {acao}
        </div>
    );
}
