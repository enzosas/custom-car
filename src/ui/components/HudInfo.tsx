import type { JogoStats } from '@/core/Jogo';

/** Dicas de teclas + seed + fps (canto superior direito, só desktop). */
export function HudInfo({ stats }: { stats: JogoStats | null }) {
    const carro = stats?.modoCarroGLB ? 'GLB' : 'Vermelho';
    const seed = stats?.seed ?? 0;
    const fps = (stats?.fps ?? 0).toFixed(0);

    return (
        <div className="hud-info">
            {`Q: wireframe  R: voltar para a pista  SHIFT: agachar/pular  ESPAÇO: freio de mão\n` +
                `botão direito: câmara  roda: zoom  X: alternar carro (${carro})\n` +
                `seed ${seed}  ${fps} fps`}
        </div>
    );
}
