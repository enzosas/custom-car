// ControlesToque.ts - estado dos botões touch, lido pelo loop do jogo.
// É um objeto mutável (não estado React) para que apertar um botão não cause re-render.

export type AcaoToque = 'forward' | 'backward' | 'left' | 'right' | 'drift' | 'jump';

export type ControlesToque = Record<AcaoToque, boolean>;

export const criarControlesToque = (): ControlesToque => ({
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    jump: false,
});

export const resetarControlesToque = (c: ControlesToque) => {
    (Object.keys(c) as AcaoToque[]).forEach((k) => { c[k] = false; });
};
