import { Fragment, useCallback, useReducer } from 'react';
import type { AbaDef } from '../../painelCampos';
import { resolverObjeto } from '../../lib/propriedade';
import { hsvParaCss } from '@/graphics/cor';
import { SectionHeader } from './SectionHeader';
import { DraggableField } from './DraggableField';
import { SwitchRow } from './SwitchRow';
import { ActionButton } from './ActionButton';
import type { AcoesPainel, ModoPainel } from './tipos';

interface Props {
    aba: AbaDef;
    config: unknown;
    modo: ModoPainel;
    acoes: AcoesPainel;
    onAlterado: () => void;
}

export function FieldList({ aba, config, modo, acoes, onAlterado }: Props) {
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
                        {sec.botoes?.map((b) => (
                            <Fragment key={b.rotulo}>
                                {b.info === 'seed' && (
                                    <div className={`painel-item info ${modo}`}>{`seed: ${acoes.lerSeed() ?? '-'}`}</div>
                                )}
                                {/* só redesenha a lista (para mostrar a seed nova): nada no GAME_CONFIG mudou */}
                                <ActionButton rotulo={b.rotulo} modo={modo} onClick={() => { acoes[b.acao](); atualizar(); }} />
                            </Fragment>
                        ))}
                    </Fragment>
                );
            })}
        </>
    );
}