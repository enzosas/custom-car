// RastroPneu.ts — port de RastroPneu.h: fitas de derrapagem das rodas traseiras com esmaecimento.

import { type V3, clamp } from './Mat4';

interface PontoFita { posEsq: V3; posDir: V3; posCentro: V3 }
interface FitaRastro { pontos: PontoFita[]; tempoVidaRestante: number; alphaInicial: number; aberta: boolean }

export class RastroPneu {
    private fitas: FitaRastro[][] = [[], []]; // 0 = TE, 1 = TD
    private offsetElevacao = 0.08;
    private distMinimaSq = 0.04;

    constructor(private larguraRastro = 1.4, private tempoVidaMax = 6.0) {}

    setLargura(larg: number) { this.larguraRastro = larg; }

    adicionarPontoRoda(rodaIdx: number, posContato: V3, _vetorEixo: V3, intensidade: number, conectar = false) {
        if (rodaIdx < 0 || rodaIdx >= 2) return;
        const centroAtual: V3 = { x: posContato.x, y: posContato.y + this.offsetElevacao, z: posContato.z };
        const lista = this.fitas[rodaIdx];

        if (!conectar || lista.length === 0 || !lista[lista.length - 1].aberta) {
            if (lista.length > 0 && lista[lista.length - 1].aberta) lista[lista.length - 1].aberta = false;
            lista.push({
                tempoVidaRestante: this.tempoVidaMax,
                alphaInicial: clamp(intensidade, 0.15, 0.40),
                aberta: true,
                pontos: [{ posCentro: { ...centroAtual }, posEsq: { ...centroAtual }, posDir: { ...centroAtual } }],
            });
            return;
        }

        const fita = lista[lista.length - 1];
        const pUltimo = fita.pontos[fita.pontos.length - 1].posCentro;
        const dx = centroAtual.x - pUltimo.x, dz = centroAtual.z - pUltimo.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < this.distMinimaSq) return;

        const l = Math.sqrt(distSq);
        const dirX = dx / l, dirZ = dz / l;
        const nx = -dirZ, nz = dirX; // normal horizontal perpendicular à trajetória
        const meia = this.larguraRastro * 0.5;

        if (fita.pontos.length === 1) {
            fita.pontos[0].posEsq = { x: pUltimo.x - nx * meia, y: pUltimo.y, z: pUltimo.z - nz * meia };
            fita.pontos[0].posDir = { x: pUltimo.x + nx * meia, y: pUltimo.y, z: pUltimo.z + nz * meia };
        }
        fita.pontos.push({
            posCentro: { ...centroAtual },
            posEsq: { x: centroAtual.x - nx * meia, y: centroAtual.y, z: centroAtual.z - nz * meia },
            posDir: { x: centroAtual.x + nx * meia, y: centroAtual.y, z: centroAtual.z + nz * meia },
        });
    }

    finalizarSessaoDerrapagem() {
        for (let i = 0; i < 2; ++i) {
            const l = this.fitas[i];
            if (l.length > 0 && l[l.length - 1].aberta) l[l.length - 1].aberta = false;
        }
    }

    update(dt: number) {
        for (let i = 0; i < 2; ++i) {
            for (const f of this.fitas[i]) f.tempoVidaRestante -= dt;
            this.fitas[i] = this.fitas[i].filter((f) => !(!f.aberta && f.tempoVidaRestante <= 0));
        }
    }

    /**
     * Gera os triângulos de todas as fitas. Devolve número de vértices escritos em `pos` e `cor`
     * (realoca se faltar espaço).
     */
    gerarGeometria(saida: { pos: Float32Array; cor: Float32Array }): number {
        let total = 0;
        for (let i = 0; i < 2; ++i) for (const f of this.fitas[i]) if (f.pontos.length >= 2) total += (f.pontos.length - 1) * 6;
        if (saida.pos.length < total * 3) {
            const cap = Math.max(total * 3, saida.pos.length * 2, 3 * 6000);
            saida.pos = new Float32Array(cap);
            saida.cor = new Float32Array(cap);
        }
        let v = 0;
        const { pos, cor } = saida;
        const put = (p: V3, c: number) => {
            pos[v * 3] = p.x; pos[v * 3 + 1] = p.y; pos[v * 3 + 2] = p.z;
            cor[v * 3] = c; cor[v * 3 + 1] = c; cor[v * 3 + 2] = c;
            v++;
        };
        for (let i = 0; i < 2; ++i) {
            for (const fita of this.fitas[i]) {
                if (fita.pontos.length < 2) continue;
                const fatorVida = clamp(fita.tempoVidaRestante / this.tempoVidaMax, 0, 1);
                const c = 0.02 * (fita.alphaInicial * fatorVida); // corPreta * (alpha * vida)
                for (let k = 1; k < fita.pontos.length; ++k) {
                    const a = fita.pontos[k - 1], b = fita.pontos[k];
                    put(a.posEsq, c); put(b.posEsq, c); put(a.posDir, c);
                    put(a.posDir, c); put(b.posEsq, c); put(b.posDir, c);
                }
            }
        }
        return v;
    }
}
