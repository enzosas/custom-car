import { GAME_CONFIG } from './config';
import { ABAS, type CampoDef } from './painelCampos';
import { Entrada } from './Input';
import { mix } from './Mat4';
import { TouchHUD } from './TouchHUDController';
import { isMobileDevice } from './JogoCena';

const H0 = 1000;

class Propriedade {
    valorBase = 1;
    constructor(public nome: string, public tipo: 'float' | 'uint' | 'secao', private obj: any, private chave: string, public fator = 1) {
        if (tipo === 'float') {
            this.valorBase = this.obj[this.chave] / this.fator;
            if (Math.abs(this.valorBase) < 0.0001) this.valorBase = 1;
        } else if (tipo === 'uint') {
            this.valorBase = this.obj[this.chave];
            if (this.valorBase < 1) this.valorBase = 1;
        }
    }
    ajustarPorArrasto(deltaX: number, modoAcelerado = false) {
        if (this.tipo === 'secao') return;
        const taxa = modoAcelerado ? 1.0 : 0.10;
        let mudancaPorPixel = (this.valorBase * taxa) / 100;
        if (this.tipo === 'float') {
            if (Math.abs(mudancaPorPixel) < 0.001) mudancaPorPixel = 0.01;
            this.obj[this.chave] += deltaX * mudancaPorPixel * this.fator;
        } else {
            const novo = this.obj[this.chave] + deltaX * mudancaPorPixel;
            this.obj[this.chave] = Math.round(Math.max(0, novo));
        }
    }
    valorComoString(): string {
        if (this.tipo === 'float') return (this.obj[this.chave] / this.fator).toFixed(4);
        if (this.tipo === 'uint') return String(this.obj[this.chave]);
        return '';
    }
}

class Botao {
    private escalaAtual = 1;
    private escalaAlvo = 1;
    private pressionado = false;
    readonly el: HTMLDivElement;
    readonly rotulo: HTMLDivElement;
    
    constructor(host: HTMLElement, texto: string, private isMobile: boolean, private origX=0, private origY=0, private origW=0, private origH=0) {
        this.el = document.createElement('div');
        this.el.className = `glass-panel painel-btn ${isMobile ? 'mobile' : 'desktop'}`;
        
        this.rotulo = document.createElement('div');
        this.rotulo.className = 'rotulo';
        
        if (!isMobile) {
            this.el.style.left = `${origX}px`;
            this.el.style.top = `${H0 - (origY + origH)}px`;
            this.el.style.width = `${origW}px`;
            this.el.style.height = `${origH}px`;
        }
        
        this.rotulo.textContent = texto;
        this.el.appendChild(this.rotulo);
        host.appendChild(this.el);
    }
    
    update(): boolean {
        let clicou = false;
        let dentro = false;
        
        if (this.isMobile) {
            const rect = this.el.getBoundingClientRect();
            const mx = Entrada.mouseX;
            const my = Entrada.mouseY; 
            dentro = mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom;
        } else {
            const mx = Entrada.mouseX, myInv = H0 - Entrada.mouseY;
            dentro = mx >= this.origX && mx <= this.origX + this.origW && myInv >= this.origY && myInv <= this.origY + this.origH;
        }

        if (dentro) {
            if (Entrada.esquerdo) { this.escalaAlvo = this.isMobile ? 0.9 : 0.85; this.pressionado = true; }
            else if (this.pressionado) { clicou = true; this.pressionado = false; this.escalaAlvo = 1.0; }
            else { this.escalaAlvo = 1.0; }
        } else {
            this.pressionado = false;
            this.escalaAlvo = 1;
        }
        
        this.escalaAtual = mix(this.escalaAtual, this.escalaAlvo, 0.2);
        this.el.style.transform = `scale(${this.escalaAtual})`;
        
        return clicou;
    }

    desenhar(texto: string) {
        if (this.rotulo.textContent !== texto) this.rotulo.textContent = texto;
    }
}

class ItemArrastavel {
    arrastando = false;
    private ultimoMouseX = 0;
    readonly el: HTMLDivElement;
    
    constructor(host: HTMLElement, public prop: Propriedade, private isMobile: boolean, private origX=0, private origY=0, private origW=0, private origH=0) {
        this.el = document.createElement('div');
        this.el.className = `painel-item ${isMobile ? 'mobile' : 'desktop'} ${prop.tipo === 'secao' ? 'secao' : ''}`;
        
        if (!isMobile) {
            this.el.style.left = `${origX}px`;
            this.el.style.top = `${H0 - (origY + origH)}px`;
            this.el.style.width = `${origW}px`;
            this.el.style.height = `${origH}px`;
        }
        host.appendChild(this.el);
    }

    tentarIniciarArrasto(): boolean {
        if (this.prop.tipo === 'secao') return false;
        let dentro = false;
        
        if (this.isMobile) {
            const rect = this.el.getBoundingClientRect();
            const mx = Entrada.mouseX;
            const my = Entrada.mouseY;
            dentro = mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom;
        } else {
            const mx = Entrada.mouseX, myInv = H0 - Entrada.mouseY;
            dentro = mx >= this.origX && mx <= this.origX + this.origW && myInv >= this.origY && myInv <= this.origY + this.origH;
        }
        
        if (dentro && Entrada.esquerdo) { this.arrastando = true; this.ultimoMouseX = Entrada.mouseX; return true; }
        return false;
    }
    
    atualizarArrasto(): boolean {
        if (!this.arrastando) return false;
        if (!Entrada.esquerdo) { this.arrastando = false; return false; }
        const dx = Entrada.mouseX - this.ultimoMouseX;
        if (dx !== 0) {
            this.prop.ajustarPorArrasto(dx, Entrada.tecla('ShiftLeft') || Entrada.tecla('ShiftRight'));
            this.ultimoMouseX = Entrada.mouseX;
        }
        return true;
    }
    
    desenhar() {
        const t = this.prop.tipo === 'secao' ? this.prop.nome : `${this.prop.nome}: ${this.prop.valorComoString()}`;
        if (this.el.textContent !== t) this.el.textContent = t;
        
        if (this.arrastando) this.el.classList.add('dragging');
        else this.el.classList.remove('dragging');
    }
    remover() { this.el.remove(); }
}

interface Aba { tituloBotao: string; campos: Propriedade[] }

export class PainelConfig {
    private raiz: HTMLDivElement;
    private abas: Aba[] = [];
    private botoesMenu: Botao[] = [];
    private btnPiloto: Botao;
    private itens: ItemArrastavel[] = [];
    private itemArrastando: ItemArrastavel | null = null;
    private abaAtiva = -1; 
    private isMobile = isMobileDevice();

    private colMenu!: HTMLDivElement;
    private colSliders!: HTMLDivElement;
    private colVazia!: HTMLDivElement;
    
    private desktopPanel!: HTMLDivElement;
    private fundo!: HTMLDivElement;
    private abertoDesktop = false;
    private readonly painelX = 220;
    private readonly painelY = 20;
    private readonly painelLargura = 420;
    private readonly painelAltura = 960;

    constructor(host: HTMLElement, private config = GAME_CONFIG) {
        this.raiz = document.createElement('div');
        
        if (this.isMobile) {
            this.raiz.className = 'painel-config-root';
            
            this.colMenu = document.createElement('div');
            this.colMenu.className = 'painel-col-menu';
            this.colSliders = document.createElement('div');
            this.colSliders.className = 'painel-col-sliders glass-panel';
            this.colVazia = document.createElement('div');
            this.colVazia.className = 'painel-col-vazia';

            this.raiz.appendChild(this.colMenu);
            this.raiz.appendChild(this.colSliders);
            this.raiz.appendChild(this.colVazia);
            host.appendChild(this.raiz);

            this.registrarAbas();
            this.abas.forEach((aba) => this.botoesMenu.push(new Botao(this.colMenu, aba.tituloBotao, true)));
            this.btnPiloto = new Botao(this.colMenu, 'piloto auto: off', true);
            
            this.abaAtiva = 0;
            this.carregarItensAba(0);
        } else {
            this.raiz.style.position = 'absolute';
            this.raiz.style.inset = '0';
            this.raiz.style.pointerEvents = 'none';
            this.raiz.style.overflow = 'hidden';
            host.appendChild(this.raiz);

            this.desktopPanel = document.createElement('div');
            this.desktopPanel.className = 'desktop-panel-container';
            this.raiz.appendChild(this.desktopPanel);

            this.fundo = document.createElement('div');
            this.fundo.className = 'painel-fundo-desktop glass-panel';
            this.fundo.style.left = `${this.painelX}px`;
            this.fundo.style.top = `${H0 - (this.painelY + this.painelAltura)}px`;
            this.fundo.style.width = `${this.painelLargura}px`;
            this.fundo.style.height = `${this.painelAltura}px`;
            // A prioridade display: none estava aqui e foi apagada!
            this.desktopPanel.appendChild(this.fundo);

            this.registrarAbas();
            const btnX = 15, btnY = 920, btnW = 180, btnH = 42, espaco = 50;
            this.abas.forEach((aba, i) => this.botoesMenu.push(new Botao(this.raiz, aba.tituloBotao, false, btnX, btnY - i * espaco, btnW, btnH)));
            this.btnPiloto = new Botao(this.raiz, 'piloto auto: off', false, btnX, btnY - this.abas.length * espaco, btnW, btnH);
        }
    }

    private registrarAbas() {
        this.abas = ABAS.map((aba) => {
            const campos: Propriedade[] = [];
            for (const sec of aba.secoes) {
                campos.push(new Propriedade(sec.titulo, 'secao', null, ''));
                let obj: any = this.config;
                for (const k of sec.caminho) obj = obj[k];
                for (const c of sec.campos as CampoDef[]) campos.push(new Propriedade(c.nome, c.tipo, obj, c.nome, c.fator));
            }
            return { tituloBotao: aba.titulo, campos };
        });
    }

    private carregarItensAba(index: number) {
        if (index < 0 || index >= this.abas.length) return;
        this.itens.forEach((i) => i.remover());
        this.itens = [];
        this.itemArrastando = null;
        
        if (this.isMobile) {
            this.abas[index].campos.forEach((p) => {
                this.itens.push(new ItemArrastavel(this.colSliders, p, true));
            });
        } else {
            const startY = this.painelY + this.painelAltura - 40;
            this.abas[index].campos.forEach((p, i) => {
                this.itens.push(new ItemArrastavel(this.desktopPanel, p, false, this.painelX + 25, startY - i * 26, this.painelLargura - 50, 22));
            });
        }
    }

    isMouseSobreUI(): boolean {
        if (this.isMobile) return false; 
        
        const mx = Entrada.mouseX, myInv = H0 - Entrada.mouseY;
        if (mx >= 15 && mx <= 195) return true;
        if (this.abertoDesktop) {
            if (mx >= this.painelX && mx <= this.painelX + this.painelLargura &&
                myInv >= this.painelY && myInv <= this.painelY + this.painelAltura) return true;
        }
        return false;
    }

    update(): boolean {
        if (this.isMobile && !TouchHUD.configMode) return false;

        let alterou = false;
        if (this.btnPiloto.update()) {
            this.config.pilotoAutomaticoOn = !this.config.pilotoAutomaticoOn;
            alterou = true;
        }
        
        if (!this.itemArrastando) {
            for (let i = 0; i < this.botoesMenu.length; ++i) {
                if (this.botoesMenu[i].update()) {
                    if (this.isMobile) {
                        if (this.abaAtiva !== i) {
                            this.abaAtiva = i;
                            this.carregarItensAba(i);
                        }
                    } else {
                        if (this.abertoDesktop && this.abaAtiva === i) {
                            this.abertoDesktop = false; 
                            this.abaAtiva = -1;
                            this.itemArrastando = null;
                        } else {
                            this.abertoDesktop = true; 
                            this.abaAtiva = i;
                            this.carregarItensAba(i);
                        }
                    }
                }
            }
        }
        
        if (this.itemArrastando) {
            if (this.itemArrastando.atualizarArrasto()) alterou = true;
            else this.itemArrastando = null;
        } else {
            for (const item of this.itens) {
                if (item.tentarIniciarArrasto()) { this.itemArrastando = item; alterou = true; break; }
            }
        }
        return alterou;
    }

    render() {
        this.btnPiloto.desenhar('piloto auto: ' + (this.config.pilotoAutomaticoOn ? 'on' : 'off'));
        
        if (this.isMobile) {
            const visivel = TouchHUD.configMode;
            if (visivel) this.raiz.classList.add('open');
            else this.raiz.classList.remove('open');
            
            this.botoesMenu.forEach((b, i) => {
                if (i === this.abaAtiva) b.el.classList.add('active-tab');
                else b.el.classList.remove('active-tab');
                b.desenhar(this.abas[i].tituloBotao);
            });
            if (visivel) this.itens.forEach((it) => it.desenhar());
        } else {
            if (this.abertoDesktop) this.desktopPanel.classList.add('open');
            else this.desktopPanel.classList.remove('open');

            this.abas.forEach((a, i) => {
                if (this.abertoDesktop && i === this.abaAtiva) this.botoesMenu[i].el.classList.add('active-tab');
                else this.botoesMenu[i].el.classList.remove('active-tab');
                this.botoesMenu[i].desenhar(a.tituloBotao);
            });
            this.itens.forEach((it) => it.desenhar());
        }
    }

    dispose() { this.raiz.remove(); }
}