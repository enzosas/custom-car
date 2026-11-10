import { Fragment, useCallback, useReducer } from 'react';
import type { AbaDef } from '../../painelCampos';
import { resolverObjeto } from '../../lib/propriedade';
import { hsvParaCss } from '@/graphics/cor';
import { SectionHeader } from './SectionHeader';
import { DraggableField } from './DraggableField';
import { SwitchRow } from './SwitchRow';
import type { ModoPainel } from './tipos';

interface Props {
    aba: AbaDef;
    config: unknown;
    modo: ModoPainel;
    onAlterado: () => void;
}

export function FieldList({ aba, config, modo, onAlterado }: Props) {
    // re-renderiza a lista a cada ajuste para a amostra de cor HSV acompanhar o arrasto
    const [, atualizar] = useReducer((n: number) => n + 1, 0);
    const aoAlterar = useCallback(() => { atualizar(); onAlterado(); }, [onAlterado]);

    return (
        <>
            {aba.secoes.map((sec) => {
                const objeto = resolverObjeto(config, sec.caminho);
                return (
                    <Fragment key={`${sec.caminho.join('.')}|${sec.titulo}`}>
                        <SectionHeader titulo={sec.titulo} modo={modo} />
                        {sec.amostra && (
                            <div
                                className={`painel-amostra ${modo}`}
                                style={{ background: hsvParaCss(objeto[sec.amostra.h], objeto[sec.amostra.s], objeto[sec.amostra.v]) }}
                            />
                        )}
                        {sec.campos.map((c) => (
                            <DraggableField
                                key={c.nome} def={c} objeto={objeto} caminho={sec.caminho} modo={modo}
                                aplicarAoSoltar={sec.aplicarAoSoltar} onAlterado={aoAlterar}
                            />
                        ))}
                        {sec.interruptores?.map((i) => (
                            <SwitchRow
                                key={i.nome} rotulo={i.rotulo} chave={i.nome} modo={modo} onAlterado={aoAlterar}
                                objeto={objeto as unknown as Record<string, boolean>}
                            />
                        ))}
                    </Fragment>
                );
            })}
        </>
    );
}