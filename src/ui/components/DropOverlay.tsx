import type { FaseDrop } from '../hooks/useGlbDrop';

/** overlay do drag & drop de .glb (estilo e animações em base.css, .drop-overlay) */
export function DropOverlay({ fase }: { fase: FaseDrop }) {
    return (
        <div className={`drop-overlay drop-overlay--${fase}`}>
            <div className="drop-overlay-moldura">
                <div className="drop-overlay-icone" aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v12" />
                        <path d="M7 10l5 5 5-5" />
                        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                </div>
                <div className="drop-overlay-titulo">Solte o arquivo .glb do carro aqui</div>
                <div className="drop-overlay-subtitulo">O modelo atual será substituído</div>
            </div>
        </div>
    );
}
