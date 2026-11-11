export type ModoPainel = 'mobile' | 'desktop';

/** o que o painel pode pedir ao motor (botões e informações); montado em ConfigPanel a partir do jogoRef */
export interface AcoesPainel {
    /** sorteia uma nova seed e reconstrói o mundo (terreno, pista e vegetação) */
    novaSeed: () => void;
    /** seed atual do mundo, ou null se o motor ainda não existe */
    lerSeed: () => number | null;
}