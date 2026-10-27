// Particulas.ts — port de Particulas.h: fumaça de drift e pedaços de grama (billboards).

import { type V3, mix } from './Mat4';
import { randGlobal } from './Random';

export enum TipoParticula { P_FUMACA, P_GRAMA }

interface Particula {
    pos: V3; vel: V3; tempoVida: number; tempoVidaMax: number;
    escalaInicial: number; escalaFinal: number; cor: V3; alphaInicial: number;
    tipo: TipoParticula; anguloZ: number; velAngular: number;
}

export class SistemaParticulas {
    private particulas: Particula[] = [];
    private rnd = randGlobal;

    private r(min: number, max: number) { return this.rnd.randFloat(min, max); }

    emitirFumaca(posAtual: V3, velRoda: V3, dt: number, quantidade: number) {
        for (let i = 0; i < quantidade; ++i) {
            const fator = this.r(0, 1);
            const posPassada = { x: posAtual.x - velRoda.x * dt, y: posAtual.y - velRoda.y * dt, z: posAtual.z - velRoda.z * dt };
            const base = { x: mix(posPassada.x, posAtual.x, fator), y: mix(posPassada.y, posAtual.y, fator), z: mix(posPassada.z, posAtual.z, fator) };

            const pos = { x: base.x + this.r(-0.6, 0.6), y: base.y + this.r(0, 0.6), z: base.z + this.r(-0.6, 0.6) };
            const vel = { x: this.r(-1.5, 1.5), y: this.r(1, 3), z: this.r(-1.5, 1.5) };
            const tempoVidaMax = this.r(0.6, 1.2);
            const escalaInicial = this.r(1.8, 2.8);
            const escalaFinal = this.r(6, 10);
            const tom = this.r(0.35, 0.55);
            const alphaInicial = this.r(0.10, 0.25);
            const anguloZ = this.r(0, 6.28);
            const velAngular = this.r(-2, 2);

            this.particulas.push({
                pos, vel, tempoVida: tempoVidaMax, tempoVidaMax, escalaInicial, escalaFinal,
                cor: { x: tom, y: tom, z: tom }, alphaInicial, tipo: TipoParticula.P_FUMACA, anguloZ, velAngular,
            });
        }
    }

    emitirGrama(origem: V3, velRoda: V3, quantidade: number) {
        for (let i = 0; i < quantidade; ++i) {
            const pos = { x: origem.x + this.r(-1, 1), y: origem.y + this.r(0, 1), z: origem.z + this.r(-1, 1) };

            // velOposta = -normalize(velRoda + 0.001)
            const vx = velRoda.x + 0.001, vy = velRoda.y + 0.001, vz = velRoda.z + 0.001;
            const l = Math.hypot(vx, vy, vz) || 1;
            const ox = -vx / l, oy = -vy / l, oz = -vz / l;

            const k = this.r(0, 4);
            const vel = { x: ox * k + this.r(-25, 25), y: oy * k + this.r(50, 85), z: oz * k + this.r(-25, 25) };

            const tempoVidaMax = this.r(1.0, 1.6);
            const escalaInicial = this.r(1.5, 3.0);
            const lum = this.r(0.99, 1.01);
            const anguloZ = this.r(0, 6.28);
            const velAngular = this.r(-45, 45);

            this.particulas.push({
                pos, vel, tempoVida: tempoVidaMax, tempoVidaMax, escalaInicial, escalaFinal: 0,
                cor: { x: 0.34 * lum, y: 0.70 * lum, z: 0.56 * lum }, alphaInicial: 1,
                tipo: TipoParticula.P_GRAMA, anguloZ, velAngular,
            });
        }
    }

    update(dt: number) {
        for (const p of this.particulas) {
            p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
            if (p.tipo === TipoParticula.P_GRAMA) p.vel.y -= 100 * dt;
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
        for (const p of this.particulas) total += p.tipo === TipoParticula.P_FUMACA ? 6 : 3;
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

            if (p.tipo === TipoParticula.P_FUMACA) {
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
