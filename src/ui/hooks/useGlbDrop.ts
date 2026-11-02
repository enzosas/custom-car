import { useRef, useState, type DragEvent } from 'react';

/**
 * Drag & drop de um arquivo .glb sobre a cena.
 * O contador evita o "pisca" do overlay quando o cursor passa por elementos filhos.
 */
export function useGlbDrop(aoReceberArquivo: (arquivo: File) => void) {
    const [arrastando, setArrastando] = useState(false);
    const contador = useRef(0);

    const onDragEnter = (e: DragEvent) => {
        e.preventDefault();
        contador.current++;
        setArrastando(true);
    };

    const onDragLeave = (e: DragEvent) => {
        e.preventDefault();
        contador.current--;
        if (contador.current <= 0) {
            contador.current = 0;
            setArrastando(false);
        }
    };

    const onDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        contador.current = 0;
        setArrastando(false);

        const arquivo = e.dataTransfer.files?.[0];
        if (!arquivo) return;

        if (!arquivo.name.toLowerCase().endsWith('.glb')) {
            alert('Apenas ficheiros no formato .glb são suportados!');
            return;
        }
        aoReceberArquivo(arquivo);
    };

    return { arrastando, handlers: { onDragEnter, onDragLeave, onDragOver, onDrop } };
}
