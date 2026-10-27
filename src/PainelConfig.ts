// PainelConfig.ts — port de PainelConfig.h + Botao.h + ItemArrastavel.h + Propriedade.h.
// Mesma lógica por polling a cada frame do C++; o desenho usa elementos DOM sobre o canvas.
// As coordenadas seguem a janela de referência 1000x1000 do original, ancoradas no topo.

import { GAME_CONFIG } from './config';
import { ABAS, type CampoDef } from './painelCampos';
import { Entrada } from './Input';
import { mix } from './Mat4';

const H0 = 1000; // altura de referência da janela original

// ---------------- Propriedade ----------------
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

// ---------------- Botão (hover/clique animados) ----------------
class Botao {
    private escalaAtual = 1;
    private escalaAlvo = 1;
    private pressionado = false;
    readonly el: HTMLDivElement;
    readonly rotulo: HTMLDivElement;

    constructor(host: HTMLElement, private x: number, private y: number, private w: number, private h: number, private opacidade: number) {
        this.el = document.createElement('div');
        Object.assign(this.el.style, {
            position: 'absolute', left: `${x}px`, top: `${H0 - (y + h)}px`, width: `${w}px`, height: `${h}px`,
            background: `rgba(0,0,0,${opacidade})`, transformOrigin: '50% 50%',
        } as CSSStyleDeclaration);
        this.rotulo = document.createElement('div');
        Object.assign(this.rotulo.style, {
            position: 'absolute', left: '16px', top: '11px', lineHeight: '22px', fontSize: '19.7px',
            color: '#fff', whiteSpace: 'nowrap',
        } as CSSStyleDeclaration);
        this.el.appendChild(this.rotulo);
        host.appendChild(this.el);
    }

    /** retorna true no frame em que ocorre o clique (soltar o botão dentro da área) */
    update(): boolean {
        const mx = Entrada.mouseX, myInv = H0 - Entrada.mouseY;
        const dentro = mx >= this.x && mx <= this.x + this.w && myInv >= this.y && myInv <= this.y + this.h;
        let clicou = false;
        if (dentro) {
            if (Entrada.esquerdo) { this.escalaAlvo = 0.85; this.pressionado = true; }
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

// ---------------- Item arrastável ----------------
class ItemArrastavel {
    arrastando = false;
    private ultimoMouseX = 0;
    readonly el: HTMLDivElement;

    constructor(host: HTMLElement, public prop: Propriedade, private x: number, private y: number, private w: number, private h: number) {
        this.el = document.createElement('div');
        Object.assign(this.el.style, {
            position: 'absolute', left: `${x}px`, top: `${H0 - (y + h)}px`, width: `${w}px`, height: `${h}px`,
            lineHeight: '22px', fontSize: '19.7px', color: '#fff', whiteSpace: 'nowrap', paddingTop: '5px',
        } as CSSStyleDeclaration);
        host.appendChild(this.el);
    }

    tentarIniciarArrasto(): boolean {
        if (this.prop.tipo === 'secao') return false;
        const mx = Entrada.mouseX, myInv = H0 - Entrada.mouseY;
        const dentro = mx >= this.x && mx <= this.x + this.w && myInv >= this.y && myInv <= this.y + this.h;
        if (dentro && Entrada.esquerdo) { this.arrastando = true; this.ultimoMouseX = mx; return true; }
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

// ---------------- Painel ----------------
interface Aba { tituloBotao: string; campos: Propriedade[] }

export class PainelConfig {
    private raiz: HTMLDivElement;
    private fundo: HTMLDivElement;
    private abas: Aba[] = [];
    private botoesMenu: Botao[] = [];
    private btnPiloto: Botao;
    private itens: ItemArrastavel[] = [];
    private itemArrastando: ItemArrastavel | null = null;
    private abaAtiva = -1;
    private aberto = false;

    private readonly painelX = 220;
    private readonly painelY = 20;
    private readonly painelLargura = 420;
    private readonly painelAltura = 960;

    constructor(host: HTMLElement, private config = GAME_CONFIG) {
        this.raiz = document.createElement('div');
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
        this.abas.forEach((_, i) => this.botoesMenu.push(new Botao(this.raiz, btnX, btnY - i * espaco, btnW, btnH, 0.70)));
        this.btnPiloto = new Botao(this.raiz, btnX, btnY - this.abas.length * espaco, btnW, btnH, 0.70);
    }

    /** gerarAbasAutomaticas(): cada seção vira um título + seus campos */
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
        const startY = this.painelY + this.painelAltura - 40;
        this.abas[index].campos.forEach((p, i) => {
            this.itens.push(new ItemArrastavel(this.raiz, p, this.painelX + 25, startY - i * 26, this.painelLargura - 50, 22));
        });
    }

    isMouseSobreUI(): boolean {
        const mx = Entrada.mouseX, myInv = H0 - Entrada.mouseY;
        if (mx >= 15 && mx <= 195) return true;
        if (this.aberto) {
            if (mx >= this.painelX && mx <= this.painelX + this.painelLargura &&
                myInv >= this.painelY && myInv <= this.painelY + this.painelAltura) return true;
        }
        return false;
    }

    /** retorna true se algum valor/estado foi alterado neste frame */
    update(): boolean {
        let alterou = false;

        if (this.btnPiloto.update()) {
            this.config.pilotoAutomaticoOn = !this.config.pilotoAutomaticoOn;
            alterou = true;
        }

        if (!this.itemArrastando) {
            for (let i = 0; i < this.botoesMenu.length; ++i) {
                if (this.botoesMenu[i].update()) {
                    if (this.aberto && this.abaAtiva === i) {
                        this.aberto = false; this.abaAtiva = -1;
                        this.itens.forEach((it) => it.remover()); this.itens = [];
                        this.itemArrastando = null;
                    } else {
                        this.aberto = true; this.abaAtiva = i;
                        this.carregarItensAba(i);
                    }
                }
            }
        }

        if (this.aberto) {
            if (this.itemArrastando) {
                if (this.itemArrastando.atualizarArrasto()) alterou = true;
                else this.itemArrastando = null;
            } else {
                for (const item of this.itens) {
                    if (item.tentarIniciarArrasto()) { this.itemArrastando = item; alterou = true; break; }
                }
            }
        }
        return alterou;
    }

    render() {
        this.fundo.style.display = this.aberto ? 'block' : 'none';
        this.abas.forEach((a, i) => this.botoesMenu[i].desenhar(a.tituloBotao));
        this.btnPiloto.desenhar('piloto auto: ' + (this.config.pilotoAutomaticoOn ? 'on' : 'off'));
        if (this.aberto) this.itens.forEach((it) => it.desenhar());
    }

    dispose() { this.raiz.remove(); }
}
