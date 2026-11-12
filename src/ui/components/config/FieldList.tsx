import { Fragment, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AbaDef } from '../../painelCampos';
import { resolverObjeto } from '../../lib/propriedade';
import { idItem, itensAlterados, valorOriginal } from '../../lib/padroes';
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
    /** modo "resetar configs": clicar num valor alterado o devolve ao original (em vez de arrastar) */
    modoReset: boolean;
    /** incrementa a cada clique em "resetar tudo": devolve ao original todos os valores alterados desta aba */
    sinalResetarTudo: number;
    /** vai no cabeçalho da primeira seção, à direita do título (rola junto com a lista) */
    acaoCabecalho?: ReactNode;
}

export function FieldList({ aba, config, modo, acoes, onAlterado, modoReset, sinalResetarTudo, acaoCabecalho }: Props) {
    // re-renderiza a lista a cada ajuste para a amostra de cor HSV acompanhar o arrasto
    const [, atualizar] = useReducer((n: number) => n + 1, 0);
    const aoAlterar = useCallback(() => { atualizar(); onAlterado(); }, [onAlterado]);
    const carroGLB = acoes.carroGLB();

    // contador por item: cada incremento reinicia o flash azul de "voltou ao original"
    const [flash, setFlash] = useState<Record<string, number>>({});
    const piscar = (ids: string[]) => setFlash((f) => {
        const n = { ...f };
        for (const id of ids) n[id] = (n[id] ?? 0) + 1;
        return n;
    });

    const aoResetarItem = (id: string) => { piscar([id]); aoAlterar(); };

    // "resetar tudo": o motor recebe um único aviso no fim (o terreno, por exemplo, é reconstruído uma só vez)
    const sinalAnterior = useRef(sinalResetarTudo);
    useEffect(() => {
        if (sinalResetarTudo === sinalAnterior.current) return;
        sinalAnterior.current = sinalResetarTudo;
        const itens = itensAlterados(aba, config, carroGLB);
        if (itens.length === 0) return;
        for (const i of itens) i.objeto[i.chave] = i.original;
        piscar(itens.map((i) => i.id));
        aoAlterar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sinalResetarTudo]);

    return (
        <>
            {aba.secoes.map((sec, indice) => {
                const objeto = resolverObjeto(config, sec.caminho);
                return (
                    <Fragment key={`${sec.caminho.join('.')}|${sec.titulo}`}>
                        <SectionHeader titulo={sec.titulo} modo={modo} acao={indice === 0 ? acaoCabecalho : undefined} />
                        {sec.amostra && (
                            <div
                                className={`painel-amostra ${modo}`}
                                style={{ background: hsvParaCss(objeto[sec.amostra.h], objeto[sec.amostra.s], objeto[sec.amostra.v]) }}
                            />
                        )}
                        {sec.campos.map((c) => {
                            const original = valorOriginal(sec.caminho, c.nome, carroGLB);
                            const id = idItem(sec.caminho, c.nome);
                            return (
                                <DraggableField
                                    key={c.nome} def={c} objeto={objeto} caminho={sec.caminho} modo={modo}
                                    aplicarAoSoltar={sec.aplicarAoSoltar} onAlterado={aoAlterar}
                                    modoReset={modoReset} original={typeof original === 'number' ? original : undefined}
                                    flash={flash[id] ?? 0} onResetar={aoResetarItem}
                                />
                            );
                        })}
                        {sec.interruptores?.map((i) => {
                            const original = valorOriginal(sec.caminho, i.nome, carroGLB);
                            const id = idItem(sec.caminho, i.nome);
                            return (
                                <SwitchRow
                                    key={i.nome} rotulo={i.rotulo} chave={i.nome} modo={modo} onAlterado={aoAlterar}
                                    objeto={objeto as unknown as Record<string, boolean>}
                                    modoReset={modoReset} original={typeof original === 'boolean' ? original : undefined}
                                    id={id} flash={flash[id] ?? 0} onResetar={aoResetarItem}
                                />
                            );
                        })}
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