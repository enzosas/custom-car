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
import { SeletorEstilo } from './SeletorEstilo';
import type { AcoesPainel, ModoPainel } from './tipos';
import type { NavLista } from '../../lib/navegacao';

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
    /** navegação por teclado dentro da janela (null = cursor fora dela); os índices seguem itensNavegaveis(aba) */
    nav?: NavLista | null;
}

export function FieldList({ aba, config, modo, acoes, onAlterado, modoReset, sinalResetarTudo, acaoCabecalho, nav = null }: Props) {
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

    // índice do próximo item navegável, na mesma ordem de itensNavegaveis(aba)
    let proximo = 0;
    const navDe = () => {
        const i = proximo++;
        const cursor = nav !== null && nav.item === i;
        return { cursor, acionar: nav?.acionar ?? 0, selecionado: cursor && nav!.selecionado };
    };

    return (
        <>
            {aba.secoes.map((sec, indice) => {
                const objeto = resolverObjeto(config, sec.caminho);
                return (
                    <Fragment key={`${sec.caminho.join('.')}|${sec.titulo}`}>
                        <SectionHeader titulo={sec.titulo} modo={modo} acao={indice === 0 ? acaoCabecalho : undefined} />
                        {sec.seletorEstilo && (
                            (() => {
                                const n = navDe();
                                return <SeletorEstilo objeto={objeto as unknown as Record<string, boolean>} modo={modo} onAlterado={aoAlterar} cursor={n.cursor} acionar={n.acionar} />;
                            })()
                        )}
                        {sec.amostra && (
                            <div
                                className={`painel-amostra ${modo}`}
                                style={{ background: hsvParaCss(objeto[sec.amostra.h], objeto[sec.amostra.s], objeto[sec.amostra.v]) }}
                            />
                        )}
                        {sec.campos.map((c) => {
                            const original = valorOriginal(sec.caminho, c.nome, carroGLB);
                            const id = idItem(sec.caminho, c.nome);
                            const n = navDe();
                            return (
                                <DraggableField
                                    cursor={n.cursor} selecionado={n.selecionado} passo={n.cursor ? nav?.passo : undefined}
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
                            const n = navDe();
                            return (
                                <SwitchRow
                                    cursor={n.cursor} acionar={n.acionar}
                                    key={i.nome} rotulo={i.rotulo} chave={i.nome} modo={modo} onAlterado={aoAlterar}
                                    objeto={objeto as unknown as Record<string, boolean>}
                                    modoReset={modoReset} original={typeof original === 'boolean' ? original : undefined}
                                    id={id} flash={flash[id] ?? 0} onResetar={aoResetarItem}
                                />
                            );
                        })}
                        {sec.botoes?.map((b) => {
                            const n = navDe();
                            return (
                            <Fragment key={b.rotulo}>
                                {b.info === 'seed' && (
                                    <div className={`painel-item info ${modo}`}>{`seed: ${acoes.lerSeed() ?? '-'}`}</div>
                                )}
                                {/* só redesenha a lista (para mostrar a seed nova): nada no GAME_CONFIG mudou */}
                                <ActionButton
                                    rotulo={b.rotulo} modo={modo} onClick={() => { acoes[b.acao](); atualizar(); }}
                                    cursor={n.cursor} acionar={n.acionar}
                                />
                            </Fragment>
                            );
                        })}
                    </Fragment>
                );
            })}
        </>
    );
}