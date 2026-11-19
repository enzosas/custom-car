import { useEffect, useRef, useState, type DragEvent } from 'react';

/** fase do overlay: arrastando (entra e fica), soltou (animação de soltar) ou cancelou (arquivo saiu da janela) */
export type FaseDrop = 'arrastando' | 'soltou' | 'cancelou';

// duração das animações de saída (iguais às do .drop-overlay em base.css)
const DURACAO_SOLTOU_MS = 450;
const DURACAO_CANCELOU_MS = 250;

/**
 * Drag & drop de um arquivo .glb sobre a cena.
 * O contador evita o "pisca" do overlay quando o cursor passa por elementos filhos.
 * Ao soltar/cancelar, o overlay continua montado o tempo da animação de saída.
 */
export function useGlbDrop(aoReceberArquivo: (arquivo: File) => void) {
    const [fase, setFase] = useState<FaseDrop | null>(null);
    const contador = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const limparTimer = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    };

    const sair = (f: Exclude<FaseDrop, 'arrastando'>, duracao: number) => {
        limparTimer();
        setFase(f);
        timer.current = setTimeout(() => { timer.current = null; setFase(null); }, duracao);
    };

    useEffect(() => limparTimer, []);

    const onDragEnter = (e: DragEvent) => {
        e.preventDefault();
        contador.current++;
        limparTimer();
        setFase('arrastando');
    };

    const onDragLeave = (e: DragEvent) => {
        e.preventDefault();
        contador.current--;
        if (contador.current <= 0) {
            contador.current = 0;
            sair('cancelou', DURACAO_CANCELOU_MS);
        }
    };

    const onDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        contador.current = 0;

        const arquivo = e.dataTransfer.files?.[0];
        if (!arquivo || !arquivo.name.toLowerCase().endsWith('.glb')) {
            sair('cancelou', DURACAO_CANCELOU_MS);
            if (arquivo) alert('Apenas ficheiros no formato .glb são suportados!');
            return;
        }
        sair('soltou', DURACAO_SOLTOU_MS);
        aoReceberArquivo(arquivo);
    };

    return { fase, arrastando: fase === 'arrastando', handlers: { onDragEnter, onDragLeave, onDragOver, onDrop } };
}
