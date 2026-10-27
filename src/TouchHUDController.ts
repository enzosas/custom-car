export type HUDState = { forward: boolean; backward: boolean; left: boolean; right: boolean; drift: boolean; jump: boolean; };

class TouchHUDClasse {
    public controls: HUDState = { forward: false, backward: false, left: false, right: false, drift: false, jump: false };
    public configMode = false;
    
    private ouvintes: { el: HTMLElement; tipo: string; fn: EventListener }[] = [];

    iniciar() {
        this.parar();
        this.bindButton('btn-forward', 'forward');
        this.bindButton('btn-backward', 'backward');
        this.bindButton('btn-left', 'left');
        this.bindButton('btn-right', 'right');
        this.bindButton('btn-drift', 'drift');
        this.bindButton('btn-jump', 'jump');

        // Botão de Engrenagem (Toggle + Animação Neumórfica)
        const btnConfig = document.getElementById('btn-config-toggle');
        if (btnConfig) {
            const toggle = (e: Event) => {
                e.preventDefault();
                this.configMode = !this.configMode;
                const container = document.getElementById('hud-main-container');
                if (container) {
                    if (this.configMode) container.classList.add('config-active');
                    else container.classList.remove('config-active');
                }
                btnConfig.classList.add('active'); // Ativa animação
            };
            const release = (e: Event) => {
                e.preventDefault();
                btnConfig.classList.remove('active'); // Desativa animação
            };
            
            const on = (tipo: string, fn: EventListener) => { 
                btnConfig.addEventListener(tipo, fn); 
                this.ouvintes.push({ el: btnConfig, tipo, fn }); 
            };
            on('pointerdown', toggle);
            on('pointerup', release);
            on('pointerleave', release);
            on('pointercancel', release);
        }
    }

    parar() {
        for (const l of this.ouvintes) l.el.removeEventListener(l.tipo, l.fn);
        this.ouvintes = [];
        this.controls = { forward: false, backward: false, left: false, right: false, drift: false, jump: false };
        this.configMode = false;
    }

    private bindButton(id: string, action: keyof HUDState) {
        const el = document.getElementById(id);
        if (!el) return;
        const press = (e: Event) => { e.preventDefault(); this.controls[action] = true; el.classList.add('active'); };
        const release = (e: Event) => { e.preventDefault(); this.controls[action] = false; el.classList.remove('active'); };
        const on = (tipo: string, fn: EventListener) => { el.addEventListener(tipo, fn); this.ouvintes.push({ el, tipo, fn }); };

        on('contextmenu', (e: Event) => e.preventDefault());
        on('pointerdown', press);
        on('pointerup', release);
        on('pointercancel', release);
        on('pointerleave', release);
    }
}

export const TouchHUD = new TouchHUDClasse();