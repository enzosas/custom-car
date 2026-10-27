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
        this.rotulo = document.createElement('div');
        
        if (isMobile) {
            Object.assign(this.el.style, {
                background: 'rgba(0,0,0,0.70)', position: 'relative', width: '100%', height: '46px', /* Altura maior */
                transformOrigin: '50% 50%', cursor: 'pointer', flexShrink: '0'
            } as CSSStyleDeclaration);
            Object.assign(this.rotulo.style, {
                position: 'absolute', left: '16px', top: '12px', lineHeight: '22px', fontSize: '16px', /* Fonte igual ao desktop */
                color: '#fff', whiteSpace: 'nowrap', fontFamily: 'Arial, Helvetica, sans-serif'
            } as CSSStyleDeclaration);
        } else {
            Object.assign(this.el.style, {
                position: 'absolute', left: `${origX}px`, top: `${H0 - (origY + origH)}px`, width: `${origW}px`, height: `${origH}px`,
                background: `rgba(0,0,0,0.70)`, transformOrigin: '50% 50%', cursor: 'pointer'
            } as CSSStyleDeclaration);
            Object.assign(this.rotulo.style, {
                position: 'absolute', left: '16px', top: '11px', lineHeight: '22px', fontSize: '19.7px',
                color: '#fff', whiteSpace: 'nowrap', fontFamily: 'Arial, Helvetica, sans-serif'
            } as CSSStyleDeclaration);
        }
        
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
            else if (this.pressionado) { clicou = true; this.pressionado = false; this.escalaAlvo = 0.95; }
            else { this.escalaAlvo = 0.95; }
        } else {
            this.pressionado = false;
            this.escalaAlvo = 1;
        }
        this.escalaAtual = mix(this.escalaAtual, this.escalaAlvo, 0.2);
        return clicou;
    }

    desenhar(texto: string) {
        this.el.style.transform = `scale(${this.escalaAtual})`;
        if (this.rotulo.textContent !== texto) this.rotulo.textContent = texto;
    }
}

class ItemArrastavel {
    arrastando = false;
    private ultimoMouseX = 0;
    readonly el: HTMLDivElement;
    
    constructor(host: HTMLElement, public prop: Propriedade, private isMobile: boolean, private origX=0, private origY=0, private origW=0, private origH=0) {
        this.el = document.createElement('div');
        
        if (isMobile) {
            Object.assign(this.el.style, {
                lineHeight: '26px', fontSize: '15px', color: '#fff', whiteSpace: 'nowrap', paddingTop: '6px',
                cursor: 'ew-resize', userSelect: 'none', fontFamily: 'Arial, Helvetica, sans-serif'
            } as CSSStyleDeclaration);
        } else {
            Object.assign(this.el.style, {
                position: 'absolute', left: `${origX}px`, top: `${H0 - (origY + origH)}px`, width: `${origW}px`, height: `${origH}px`,
                lineHeight: '22px', fontSize: '19.7px', color: '#fff', whiteSpace: 'nowrap', paddingTop: '5px',
                cursor: 'ew-resize', userSelect: 'none', fontFamily: 'Arial, Helvetica, sans-serif'
            } as CSSStyleDeclaration);
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
        this.el.style.color = this.arrastando ? 'rgb(77,204,255)' : '#fff';
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
            this.colSliders.className = 'painel-col-sliders';
            this.colVazia = document.createElement('div');
            this.colVazia.className = 'painel-col-vazia';

            this.raiz.appendChild(this.colMenu);
            this.raiz.appendChild(this.colSliders);
            this.raiz.appendChild(this.colVazia);
            host.appendChild(this.raiz);

            this.registrarAbas();
            this.abas.forEach((aba) => this.botoesMenu.push(new Botao(this.colMenu, aba.tituloBotao, true)));
            this.btnPiloto = new Botao(this.colMenu, 'Piloto Auto: OFF', true);
            
            this.abaAtiva = 0;
            this.carregarItensAba(0);
        } else {
            Object.assign(this.raiz.style, {
                position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', userSelect: 'none',
                fontFamily: 'Arial, Helvetica, sans-serif',
            } as CSSStyleDeclaration);
            host.appendChild(this.raiz);

            this.fundo = document.createElement('div');
            Object.assign(this.fundo.style, {
                position: 'absolute', left: `${this.painelX}px`, top: `${H0 - (this.painelY + this.painelAltura)}px`,
                width: `${this.painelLargura}px`, height: `${this.painelAltura}px`, background: 'rgba(0,0,0,0.70)', display: 'none',
            } as CSSStyleDeclaration);
            this.raiz.appendChild(this.fundo);

            this.registrarAbas();
            const btnX = 15, btnY = 920, btnW = 180, btnH = 42, espaco = 50;
            this.abas.forEach((aba, i) => this.botoesMenu.push(new Botao(this.raiz, aba.tituloBotao, false, btnX, btnY - i * espaco, btnW, btnH)));
            this.btnPiloto = new Botao(this.raiz, 'Piloto Auto: OFF', false, btnX, btnY - this.abas.length * espaco, btnW, btnH);
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
                this.itens.push(new ItemArrastavel(this.raiz, p, false, this.painelX + 25, startY - i * 26, this.painelLargura - 50, 22));
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
                            this.abertoDesktop = false; this.abaAtiva = -1;
                            this.itens.forEach((it) => it.remover()); this.itens = [];
                            this.itemArrastando = null;
                        } else {
                            this.abertoDesktop = true; this.abaAtiva = i;
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
        this.btnPiloto.desenhar('Piloto Auto: ' + (this.config.pilotoAutomaticoOn ? 'ON' : 'OFF'));
        
        if (this.isMobile) {
            const visivel = TouchHUD.configMode;
            this.raiz.style.opacity = visivel ? '1' : '0';
            this.colMenu.style.pointerEvents = visivel ? 'auto' : 'none';
            this.colSliders.style.pointerEvents = visivel ? 'auto' : 'none';
            
            this.botoesMenu.forEach((b, i) => {
                b.el.style.background = (i === this.abaAtiva) ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.7)';
                b.desenhar(this.abas[i].tituloBotao);
            });
            if (visivel) this.itens.forEach((it) => it.desenhar());
        } else {
            this.fundo.style.display = this.abertoDesktop ? 'block' : 'none';
            this.abas.forEach((a, i) => this.botoesMenu[i].desenhar(a.tituloBotao));
            if (this.abertoDesktop) this.itens.forEach((it) => it.desenhar());
        }
    }

    dispose() { this.raiz.remove(); }
}