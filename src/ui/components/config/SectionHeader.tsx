import type { ModoPainel } from './tipos';

export function SectionHeader({ titulo, modo }: { titulo: string; modo: ModoPainel }) {
    return <div className={`painel-item secao ${modo}`}>{titulo}</div>;
}
