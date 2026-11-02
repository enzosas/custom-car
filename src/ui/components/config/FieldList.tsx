import { Fragment } from 'react';
import type { AbaDef } from '../../painelCampos';
import { resolverObjeto } from '../../lib/propriedade';
import { SectionHeader } from './SectionHeader';
import { DraggableField } from './DraggableField';
import type { ModoPainel } from './tipos';

interface Props {
    aba: AbaDef;
    config: unknown;
    modo: ModoPainel;
    onAlterado: () => void;
}

export function FieldList({ aba, config, modo, onAlterado }: Props) {
    return (
        <>
            {aba.secoes.map((sec) => {
                const objeto = resolverObjeto(config, sec.caminho);
                return (
                    <Fragment key={sec.caminho.join('.')}>
                        <SectionHeader titulo={sec.titulo} modo={modo} />
                        {sec.campos.map((c) => (
                            <DraggableField key={c.nome} def={c} objeto={objeto} modo={modo} onAlterado={onAlterado} />
                        ))}
                    </Fragment>
                );
            })}
        </>
    );
}
