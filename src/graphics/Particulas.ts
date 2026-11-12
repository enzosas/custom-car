// Particulas.ts — port de Particulas.h: fumaça de drift, nuvens (areia, neve, poeira), pedaços de grama e folhas (billboards).

import { type V3, mix } from './Mat4';
import { randGlobal } from '@/core/Random';

export enum TipoParticula { P_FUMACA, P_GRAMA, P_NUVEM, P_FOLHA }

/** nuvens levantadas pelo carro: a areia do deserto, a neve e a poeira cinza da rocha */
export enum TipoNuvem { AREIA, NEVE, POEIRA }

interface PerfilNuvem {
    escalaInicial: [number, number]; escalaFinal: [number, number]; vida: [number, number];
    alpha: [number, number]; velY: [number, number]; velHoriz: number; espalha: number;
    /** variação de brilho da cor (±) */
    variacao: number;
    /** true = ignora a cor recebida e usa um cinza (poeira da rocha) */
    cinza: boolean;
    /** multiplica a cor recebida: a nuvem fica um pouco mais clara que o chão e não some nele */
    brilho: number;
}

// A areia e a neve são a fumaça do drift maior (~1,8x) e mais encorpada; a poeira da rocha é pequena e quase transparente.
const PERFIS_NUVEM: Record<TipoNuvem, PerfilNuvem> = {
    [TipoNuvem.AREIA]: { escalaInicial: [3.2, 4.8], escalaFinal: [12, 18], vida: [0.9, 1.7], alpha: [0.28, 0.48], velY: [1.5, 3.5], velHoriz: 2.2, espalha: 0.9, variacao: 0.07, cinza: false, brilho: 1.1 },
    [TipoNuvem.NEVE]: { escalaInicial: [3.0, 4.5], escalaFinal: [11, 16], vida: [0.9, 1.6], alpha: [0.32, 0.55], velY: [1.5, 3.5], velHoriz: 2.2, espalha: 0.9, variacao: 0.03, cinza: false, brilho: 1 },
    [TipoNuvem.POEIRA]: { escalaInicial: [1.8, 2.8], escalaFinal: [6, 9], vida: [0.6, 1.1], alpha: [0.12, 0.22], velY: [0.8, 2.0], velHoriz: 1.2, espalha: 0.6, variacao: 0, cinza: true, brilho: 1 },
};

/** tons das folhas do outono (misturados com a cor do terreno para combinar com o chão) */
const COR_FOLHAS: V3[] = [
    { x: 0.82, y: 0.42, z: 0.12 },   // laranja
    { x: 0.70, y: 0.24, z: 0.10 },   // tijolo
    { x: 0.88, y: 0.64, z: 0.16 },   // amarelo queimado
    { x: 0.58, y: 0.32, z: 0.12 },   // marrom
];

interface Particula {
    pos: V3; vel: V3; tempoVida: number; tempoVidaMax: number;
    escalaInicial: number; escalaFinal: number; cor: V3; alphaInicial: number;
    tipo: TipoParticula; anguloZ: number; velAngular: number;
    /** aceleração para baixo (grama cai rápido, folha flutua) */
    gravidade: number;
    /** limite da velocidade de queda (0 = sem limite) */
    quedaMax: number;
    /** perda de velocidade horizontal por segundo */
    arrasto: number;
    /** vai e vem lateral (folhas): amplitude em unidades/s, fase e frequência */
    balanco: number; fase: number; freqBalanco: number;
}

/** as partículas de 4 vértices (fumaça e nuvens); as outras são triângulos */
const ehQuad = (t: TipoParticula) => t === TipoParticula.P_FUMACA || t === TipoParticula.P_NUVEM;

export class SistemaParticulas {
    private particulas: Particula[] = [];
    private rnd = randGlobal;

    private r(min: number, max: number) { return this.rnd.randFloat(min, max); }

    private nova(p: Pick<Particula, 'pos' | 'vel' | 'tempoVidaMax' | 'escalaInicial' | 'escalaFinal' | 'cor' | 'alphaInicial' | 'tipo' | 'anguloZ' | 'velAngular'>
        & Partial<Pick<Particula, 'gravidade' | 'quedaMax' | 'arrasto' | 'balanco' | 'fase' | 'freqBalanco'>>) {
        this.particulas.push({
            gravidade: 0, quedaMax: 0, arrasto: 0, balanco: 0, fase: 0, freqBalanco: 0,
            ...p, tempoVida: p.tempoVidaMax,
        });
    }

    /**
     * posição espalhada ao longo do caminho que a roda percorreu neste frame (evita "pontilhado" em alta velocidade).
     * A velocidade do carro é em unidades por frame a 60 Hz (ver Veiculo.ts), por isso o deslocamento é vel * dt * 60.
     */
    private posNoCaminho(posAtual: V3, velRoda: V3, dt: number): V3 {
        const fator = this.r(0, 1), k = dt * 60;
        return {
            x: mix(posAtual.x - velRoda.x * k, posAtual.x, fator),
            y: mix(posAtual.y - velRoda.y * k, posAtual.y, fator),
            z: mix(posAtual.z - velRoda.z * k, posAtual.z, fator),
        };
    }

    emitirFumaca(posAtual: V3, velRoda: V3, dt: number, quantidade: number) {
        for (let i = 0; i < quantidade; ++i) {
            const base = this.posNoCaminho(posAtual, velRoda, dt);
            const tom = this.r(0.35, 0.55);
            this.nova({
                pos: { x: base.x + this.r(-0.6, 0.6), y: base.y + this.r(0, 0.6), z: base.z + this.r(-0.6, 0.6) },
                vel: { x: this.r(-1.5, 1.5), y: this.r(1, 3), z: this.r(-1.5, 1.5) },
                tempoVidaMax: this.r(0.6, 1.2),
                escalaInicial: this.r(1.8, 2.8), escalaFinal: this.r(6, 10),
                cor: { x: tom, y: tom, z: tom }, alphaInicial: this.r(0.10, 0.25),
                tipo: TipoParticula.P_FUMACA, anguloZ: this.r(0, 6.28), velAngular: this.r(-2, 2),
            });
        }
    }

    /**
     * Nuvem de areia, neve ou poeira, no mesmo estilo da fumaça do drift.
     * `cor` é a cor da nuvem (ignorada na poeira); `forca` (0..1) multiplica a opacidade (rodar fora do drift = mais fraca).
     */
    emitirNuvem(tipo: TipoNuvem, posAtual: V3, velRoda: V3, dt: number, quantidade: number, cor: V3, forca = 1) {
        const f = PERFIS_NUVEM[tipo];
        for (let i = 0; i < quantidade; ++i) {
            const base = this.posNoCaminho(posAtual, velRoda, dt);
            const e = f.espalha;
            let c: V3;
            if (f.cinza) { const tom = this.r(0.50, 0.65); c = { x: tom, y: tom, z: tom }; }
            else {
                const lum = (1 + this.r(-f.variacao, f.variacao)) * f.brilho;
                c = { x: Math.min(1, cor.x * lum), y: Math.min(1, cor.y * lum), z: Math.min(1, cor.z * lum) };
            }
            this.nova({
                pos: { x: base.x + this.r(-e, e), y: base.y + this.r(0, e), z: base.z + this.r(-e, e) },
                vel: { x: this.r(-f.velHoriz, f.velHoriz), y: this.r(f.velY[0], f.velY[1]), z: this.r(-f.velHoriz, f.velHoriz) },
                tempoVidaMax: this.r(f.vida[0], f.vida[1]),
                escalaInicial: this.r(f.escalaInicial[0], f.escalaInicial[1]), escalaFinal: this.r(f.escalaFinal[0], f.escalaFinal[1]),
                cor: c, alphaInicial: this.r(f.alpha[0], f.alpha[1]) * forca,
                tipo: TipoParticula.P_NUVEM, anguloZ: this.r(0, 6.28), velAngular: this.r(-2, 2),
            });
        }
    }

    /** direção oposta ao movimento da roda (os pedaços saem para trás) */
    private opostoVel(velRoda: V3): V3 {
        const vx = velRoda.x + 0.001, vy = velRoda.y + 0.001, vz = velRoda.z + 0.001;
        const l = Math.hypot(vx, vy, vz) || 1;
        return { x: -vx / l, y: -vy / l, z: -vz / l };
    }

    /** pedaços de grama na cor do terreno sob a roda (`cor`) */
    emitirGrama(origem: V3, velRoda: V3, quantidade: number, cor: V3) {
        for (let i = 0; i < quantidade; ++i) {
            const pos = { x: origem.x + this.r(-1, 1), y: origem.y + this.r(0, 1), z: origem.z + this.r(-1, 1) };
            const o = this.opostoVel(velRoda);
            const k = this.r(0, 4);
            const vel = { x: o.x * k + this.r(-25, 25), y: o.y * k + this.r(50, 85), z: o.z * k + this.r(-25, 25) };
            const lum = this.r(0.92, 1.08);

            this.nova({
                pos, vel, tempoVidaMax: this.r(1.0, 1.6), escalaInicial: this.r(1.5, 3.0), escalaFinal: 0,
                cor: { x: cor.x * lum, y: cor.y * lum, z: cor.z * lum }, alphaInicial: 1,
                tipo: TipoParticula.P_GRAMA, anguloZ: this.r(0, 6.28), velAngular: this.r(-45, 45),
                gravidade: 100,
            });
        }
    }

    /** folhas secas do bioma de outono: sobem menos que a grama e descem devagar, balançando de um lado para o outro */
    emitirFolha(origem: V3, velRoda: V3, quantidade: number, corTerreno: V3) {
        for (let i = 0; i < quantidade; ++i) {
            const pos = { x: origem.x + this.r(-1, 1), y: origem.y + this.r(0, 1), z: origem.z + this.r(-1, 1) };
            const o = this.opostoVel(velRoda);
            const k = this.r(0, 4);
            const vel = { x: o.x * k + this.r(-14, 14), y: o.y * k + this.r(22, 40), z: o.z * k + this.r(-14, 14) };

            const folha = COR_FOLHAS[Math.floor(this.r(0, COR_FOLHAS.length - 0.001))];
            const lum = this.r(0.9, 1.1);
            const escala = this.r(2.0, 3.6);

            this.nova({
                pos, vel, tempoVidaMax: this.r(1.8, 2.8), escalaInicial: escala, escalaFinal: escala * 0.5,
                cor: {
                    x: mix(folha.x, corTerreno.x, 0.3) * lum,
                    y: mix(folha.y, corTerreno.y, 0.3) * lum,
                    z: mix(folha.z, corTerreno.z, 0.3) * lum,
                },
                alphaInicial: 1,
                tipo: TipoParticula.P_FOLHA, anguloZ: this.r(0, 6.28), velAngular: this.r(-8, 8),
                gravidade: 22, quedaMax: 10, arrasto: 1.5,
                balanco: this.r(6, 14), fase: this.r(0, 6.28), freqBalanco: this.r(3, 6),
            });
        }
    }

    /** remove todas as partículas (usado quando o interruptor de partículas é desligado) */
    limpar() { this.particulas.length = 0; }

    update(dt: number) {
        for (const p of this.particulas) {
            p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
            if (p.balanco > 0) {
                p.fase += p.freqBalanco * dt;
                p.pos.x += Math.cos(p.fase) * p.balanco * dt;
                p.pos.z += Math.sin(p.fase * 0.83) * p.balanco * dt;
            }
            if (p.arrasto > 0) { const a = Math.max(0, 1 - p.arrasto * dt); p.vel.x *= a; p.vel.z *= a; }
            if (p.gravidade > 0) {
                p.vel.y -= p.gravidade * dt;
                if (p.quedaMax > 0 && p.vel.y < -p.quedaMax) p.vel.y = -p.quedaMax;
            }
            p.anguloZ += p.velAngular * dt;
            p.tempoVida -= dt;
        }
        this.particulas = this.particulas.filter((p) => p.tempoVida > 0);
    }

    /**
     * Constrói os billboards. `camRight`/`camUp` são os eixos da câmera (linhas 0 e 1 da matriz de visão).
     * Cada vértice = 3 floats de posição + 4 de cor (rgba). Devolve o número de vértices.
     */
    gerarGeometria(camRight: V3, camUp: V3, saida: { pos: Float32Array; cor: Float32Array }): number {
        let total = 0;
        for (const p of this.particulas) total += ehQuad(p.tipo) ? 6 : 3;
        if (saida.pos.length < total * 3) {
            const cap = Math.max(total, saida.pos.length / 3 * 2, 2048);
            saida.pos = new Float32Array(cap * 3);
            saida.cor = new Float32Array(cap * 4);
        }
        let v = 0;
        const { pos, cor } = saida;
        const put = (x: number, y: number, z: number, r: number, g: number, b: number, a: number) => {
            pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
            cor[v * 4] = r; cor[v * 4 + 1] = g; cor[v * 4 + 2] = b; cor[v * 4 + 3] = a;
            v++;
        };

        for (const p of this.particulas) {
            const prog = 1 - (p.tempoVida / p.tempoVidaMax);
            const escala = mix(p.escalaInicial, p.escalaFinal, prog);
            const alpha = mix(p.alphaInicial, 0, prog);
            const cosA = Math.cos(p.anguloZ), sinA = Math.sin(p.anguloZ);

            const rx = camRight.x * escala, ry = camRight.y * escala, rz = camRight.z * escala;
            const ux = camUp.x * escala, uy = camUp.y * escala, uz = camUp.z * escala;
            const rrx = rx * cosA - ux * sinA, rry = ry * cosA - uy * sinA, rrz = rz * cosA - uz * sinA;   // rightRot
            const urx = rx * sinA + ux * cosA, ury = ry * sinA + uy * cosA, urz = rz * sinA + uz * cosA;   // upRot
            const { x: px, y: py, z: pz } = p.pos;
            const c = p.cor;

            if (ehQuad(p.tipo)) {
                const v0 = [px - rrx - urx, py - rry - ury, pz - rrz - urz];
                const v1 = [px + rrx - urx, py + rry - ury, pz + rrz - urz];
                const v2 = [px + rrx + urx, py + rry + ury, pz + rrz + urz];
                const v3 = [px - rrx + urx, py - rry + ury, pz - rrz + urz];
                for (const q of [v0, v1, v2, v0, v2, v3]) put(q[0], q[1], q[2], c.x, c.y, c.z, alpha);
            } else {
                put(px + urx, py + ury, pz + urz, c.x, c.y, c.z, alpha);              // topo
                put(px - rrx - urx, py - rry - ury, pz - rrz - urz, c.x, c.y, c.z, alpha); // base esq
                put(px + rrx - urx, py + rry - ury, pz + rrz - urz, c.x, c.y, c.z, alpha); // base dir
            }
        }
        return v;
    }

    get quantidade() { return this.particulas.length; }
}
