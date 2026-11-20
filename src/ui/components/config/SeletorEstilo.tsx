import { TabButton } from './TabButton';
import { useRef } from 'react';
import type { ModoPainel } from './tipos';
import { useRolarAte, useSinal } from '../../hooks/useSinal';

interface Props {
    /** objeto `opcoes` do GAME_CONFIG: a escolha é gravada em `estiloPS2` (true = retro), como o interruptor antigo e a tecla G */
    objeto: Record<string, boolean>;
    modo: ModoPainel;
    onAlterado: () => void;
    /** cursor do teclado nesta linha; `acionar` muda a cada L (troca de estilo) */
    cursor?: boolean;
    acionar?: number;
}

/**
 * Linha com dois botões lado a lado, "low poly" e "retro": o escolhido fica afundado (como a aba ativa).
 * Reaproveita o TabButton, que é um <div role="button"> de propósito: um <button> focado reagiria à tecla Espaço,
 * que o jogo usa como freio de mão.
 */
export function SeletorEstilo({ objeto, modo, onAlterado, cursor = false, acionar = 0 }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    useRolarAte(ref, cursor);
    const retro = !!objeto.estiloPS2;
    const escolher = (ps2: boolean) => {
        if (!!objeto.estiloPS2 === ps2) return;
        objeto.estiloPS2 = ps2;
        onAlterado();      // o pai redesenha a lista (o botão ativo muda) e avisa o motor
    };
    useSinal(acionar, cursor, () => escolher(!retro));
    return (
        <div ref={ref} className={`painel-seletor ${modo}${cursor ? ' nav-cursor' : ''}`} role="group" aria-label="estilo grafico">
            <TabButton texto="low poly" ativo={!retro} modo={modo} onClick={() => escolher(false)} />
            <TabButton texto="retro" ativo={retro} modo={modo} onClick={() => escolher(true)} />
        </div>
    );
}
