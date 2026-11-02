type Listener = { alvo: EventTarget; tipo: string; fn: EventListenerOrEventListenerObject; opts?: AddEventListenerOptions };

class EntradaClasse {
    private teclas = new Set<string>();
    private once = new Set<string>();
    mouseX = 0;
    mouseY = 0;
    esquerdo = false;
    direito = false;
    
    private touchCameraId: number | null = null;
    private pinchDistance = 0; 
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

        this.on(window, 'touchstart', (e: TouchEvent) => {
            let emMenu = false;
            for (let i = 0; i < e.touches.length; i++) {
                const el = e.touches[i].target as HTMLElement;
                if (el && el.closest && el.closest('.painel-config-root')) emMenu = true;
            }

            // Bloqueia gestos nativos APENAS se nenhum dedo estiver no menu de configuração
            if (e.touches.length > 1 && e.cancelable && !emMenu) e.preventDefault();

            const canvasTouches: Touch[] = [];
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].target === canvas) canvasTouches.push(e.touches[i]);
            }

            if (canvasTouches.length === 2) {
                const dx = canvasTouches[0].clientX - canvasTouches[1].clientX;
                const dy = canvasTouches[0].clientY - canvasTouches[1].clientY;
                this.pinchDistance = Math.hypot(dx, dy);
            }

            if (e.touches.length > 0) {
                this.mouseX = e.touches[0].clientX;
                this.mouseY = e.touches[0].clientY;
                this.esquerdo = true;
            }
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.target === canvas && this.touchCameraId === null) {
                    this.touchCameraId = t.identifier;
                    this.direito = true;
                    this.mouseX = t.clientX;
                    this.mouseY = t.clientY;
                    break;
                }
            }
        }, { passive: false });

        this.on(window, 'touchmove', (e: TouchEvent) => {
            let emMenu = false;
            for (let i = 0; i < e.touches.length; i++) {
                const el = e.touches[i].target as HTMLElement;
                if (el && el.closest && el.closest('.painel-config-root')) emMenu = true;
            }

            if (e.cancelable && !emMenu) e.preventDefault(); 

            const canvasTouches: Touch[] = [];
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].target === canvas) canvasTouches.push(e.touches[i]);
            }

            if (canvasTouches.length === 2) {
                const dx = canvasTouches[0].clientX - canvasTouches[1].clientX;
                const dy = canvasTouches[0].clientY - canvasTouches[1].clientY;
                const dist = Math.hypot(dx, dy);
                
                if (this.pinchDistance > 0) {
                    const delta = this.pinchDistance - dist;
                    this.scrollAcumulado -= delta * 0.05; 
                }
                this.pinchDistance = dist;
            }

            if (e.touches.length > 0 && this.touchCameraId === null) {
                this.mouseX = e.touches[0].clientX;
                this.mouseY = e.touches[0].clientY;
            }
            
            if (this.touchCameraId !== null) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    if (t.identifier === this.touchCameraId) {
                        if (canvasTouches.length < 2) {
                            this.mouseX = t.clientX;
                            this.mouseY = t.clientY;
                        }
                        break;
                    }
                }
            }
        }, { passive: false });

        const endTouch = (e: TouchEvent) => {
            const canvasTouches: Touch[] = [];
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].target === canvas) canvasTouches.push(e.touches[i]);
            }
            
            if (canvasTouches.length < 2) this.pinchDistance = 0; 
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
        this.pinchDistance = 0;
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
    
    consumirScroll(): number { 
        const s = this.scrollAcumulado; 
        this.scrollAcumulado = 0; 
        return s; 
    }
}

export const Entrada = new EntradaClasse();