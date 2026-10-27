type Listener = { alvo: EventTarget; tipo: string; fn: EventListenerOrEventListenerObject; opts?: AddEventListenerOptions };

class EntradaClasse {
    private teclas = new Set<string>();
    private once = new Set<string>();
    mouseX = 0;
    mouseY = 0;
    esquerdo = false;
    direito = false;
    
    private touchCameraId: number | null = null;
    private scrollAcumulado = 0;
    private ouvintes: Listener[] = [];

    private on(alvo: EventTarget, tipo: string, fn: (e: any) => void, opts?: AddEventListenerOptions) {
        alvo.addEventListener(tipo, fn, opts);
        this.ouvintes.push({ alvo, tipo, fn, opts });
    }

    iniciar(canvas: HTMLElement) {
        this.parar();
        this.on(window, 'keydown', (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
            this.teclas.add(e.code);
        });
        this.on(window, 'keyup', (e: KeyboardEvent) => { this.teclas.delete(e.code); });
        this.on(window, 'blur', () => { this.teclas.clear(); this.esquerdo = false; this.direito = false; });
        this.on(window, 'mousemove', (e: MouseEvent) => { this.mouseX = e.clientX; this.mouseY = e.clientY; });
        this.on(window, 'mousedown', (e: MouseEvent) => {
            this.mouseX = e.clientX; this.mouseY = e.clientY;
            if (e.button === 0) this.esquerdo = true;
            if (e.button === 2) this.direito = true;
        });
        this.on(window, 'mouseup', (e: MouseEvent) => {
            if (e.button === 0) this.esquerdo = false;
            if (e.button === 2) this.direito = false;
        });

        // Touch Dinâmico: Se tocou num elemento UI é esquerdo (arrastar slider), se tocou no canvas puro é direito (rodar a câmara)
        this.on(window, 'touchstart', (e: TouchEvent) => {
            if (e.touches.length > 0) {
                this.mouseX = e.touches[0].clientX;
                this.mouseY = e.touches[0].clientY;
                this.esquerdo = true;
            }
            // Procura o toque na câmara (fundo vazio)
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const target = document.elementFromPoint(t.clientX, t.clientY);
                if (target && target.tagName === 'CANVAS' && this.touchCameraId === null) {
                    this.touchCameraId = t.identifier;
                    this.direito = true;
                    this.mouseX = t.clientX;
                    this.mouseY = t.clientY;
                    break;
                }
            }
        }, { passive: true });

        this.on(window, 'touchmove', (e: TouchEvent) => {
            if (e.touches.length > 0 && this.touchCameraId === null) {
                this.mouseX = e.touches[0].clientX;
                this.mouseY = e.touches[0].clientY;
            }
            if (this.touchCameraId !== null) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    if (t.identifier === this.touchCameraId) {
                        this.mouseX = t.clientX;
                        this.mouseY = t.clientY;
                        break;
                    }
                }
            }
        }, { passive: true });

        const endTouch = (e: TouchEvent) => {
            if (e.touches.length === 0) this.esquerdo = false;
            if (this.touchCameraId !== null) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    if (t.identifier === this.touchCameraId) {
                        this.touchCameraId = null;
                        this.direito = false;
                        break;
                    }
                }
            }
        };
        
        this.on(window, 'touchend', endTouch);
        this.on(window, 'touchcancel', endTouch);

        this.on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
        this.on(canvas, 'wheel', (e: WheelEvent) => {
            e.preventDefault();
            const passo = e.deltaMode === 0 ? e.deltaY / 100 : e.deltaY;
            this.scrollAcumulado += -passo;
        }, { passive: false });
    }

    parar() {
        for (const l of this.ouvintes) l.alvo.removeEventListener(l.tipo, l.fn, l.opts);
        this.ouvintes = [];
        this.teclas.clear();
        this.touchCameraId = null;
    }

    tecla(code: string) { return this.teclas.has(code); }
    teclaUmaVez(code: string): boolean {
        if (this.teclas.has(code)) {
            if (this.once.has(code)) return false;
            this.once.add(code);
            return true;
        }
        this.once.delete(code);
        return false;
    }
    consumirScroll(): number { const s = this.scrollAcumulado; this.scrollAcumulado = 0; return s; }
}

export const Entrada = new EntradaClasse();