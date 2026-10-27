// Input.ts — estado global de teclado/mouse, equivalente às chamadas glfwGetKey / glfwGetMouseButton / glfwGetCursorPos.

type Listener = { alvo: EventTarget; tipo: string; fn: EventListenerOrEventListenerObject; opts?: AddEventListenerOptions };

class EntradaClasse {
    private teclas = new Set<string>();
    private once = new Set<string>();
    mouseX = 0;
    mouseY = 0;
    esquerdo = false;
    direito = false;
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
        this.on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
        // GLFW: yoffset > 0 ao rolar para cima (afastar o dedo); DOM: deltaY < 0.
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
    }

    /** glfwGetKey(...) == GLFW_PRESS */
    tecla(code: string) { return this.teclas.has(code); }

    /** glfwGetKeyOnce: verdadeiro só na borda de subida */
    teclaUmaVez(code: string): boolean {
        if (this.teclas.has(code)) {
            if (this.once.has(code)) return false;
            this.once.add(code);
            return true;
        }
        this.once.delete(code);
        return false;
    }

    /** consome o deslocamento da roda acumulado desde o último frame */
    consumirScroll(): number { const s = this.scrollAcumulado; this.scrollAcumulado = 0; return s; }
}

export const Entrada = new EntradaClasse();
