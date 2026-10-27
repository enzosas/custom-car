// Terreno.ts
// Port 1:1 de Terreno.h (sem dependência de three.js, para ser testável).
// Guarda o heightmap subamostrado e expõe geração de malha, altura em coordenadas
// de mundo (interpolação baricêntrica) e aplainamento sobre um caminho.

import { GAME_CONFIG } from './config';

export type Vec3 = { x: number; y: number; z: number };

import { smoothstep } from './Mat4';

export class Terreno {
    larguraOriginal = 1024;
    profundidadeOriginal = 1024;
    passoAmostragem = 4;
    larguraGrid = 256;
    profundidadeGrid = 256;

    alturas = new Float32Array(0);
    private alturasOriginais = new Float32Array(0);

    constructor(private config = GAME_CONFIG) {}

    private get espacamento() { return this.config.terreno.parametros.espacamento * 0.005; }
    private get escalaOndulacao() { return this.config.terreno.parametros.ondulacao * 0.05; }

    /** carregarRaw(): decide a resolução pelo tamanho em bytes, igual ao C++ */
    carregarRaw(buffer: ArrayBuffer): boolean {
        const tamanhoTotal = buffer.byteLength;
        if (tamanhoTotal >= 1024 * 1024 * 2) { this.larguraOriginal = this.profundidadeOriginal = 1024; }
        else if (tamanhoTotal >= 512 * 512 * 2) { this.larguraOriginal = this.profundidadeOriginal = 512; }
        else { this.larguraOriginal = this.profundidadeOriginal = 256; }

        this.passoAmostragem = this.larguraOriginal > 256 ? Math.floor(this.larguraOriginal / 256) : 1;
        this.larguraGrid = Math.floor(this.larguraOriginal / this.passoAmostragem);
        this.profundidadeGrid = Math.floor(this.profundidadeOriginal / this.passoAmostragem);

        // uint16 little-endian (mesmo que o fread do C++ em x86/ARM)
        const view = new DataView(buffer);
        this.alturas = new Float32Array(this.larguraGrid * this.profundidadeGrid);
        for (let z = 0; z < this.profundidadeGrid; ++z) {
            for (let x = 0; x < this.larguraGrid; ++x) {
                const origX = x * this.passoAmostragem;
                const origZ = z * this.passoAmostragem;
                const val = view.getUint16((origZ * this.larguraOriginal + origX) * 2, true);
                this.alturas[z * this.larguraGrid + x] = val / 65535.0;
            }
        }
        this.alturasOriginais = this.alturas.slice();
        return true;
    }

    restaurarOriginal() {
        if (this.alturasOriginais.length) this.alturas = this.alturasOriginais.slice();
    }

    /** Posições (x,y,z) dos vértices — reconstruirGeometria() */
    gerarPosicoes(): Float32Array {
        const { larguraGrid: W, profundidadeGrid: D } = this;
        const esp = this.espacamento, esc = this.escalaOndulacao;
        const offsetX = W * esp * 0.5, offsetZ = D * esp * 0.5;
        const pos = new Float32Array(W * D * 3);
        for (let z = 0; z < D; ++z) {
            for (let x = 0; x < W; ++x) {
                const i = (z * W + x) * 3;
                pos[i] = x * esp - offsetX;
                pos[i + 1] = this.alturas[z * W + x] * esc;
                pos[i + 2] = z * esp - offsetZ;
            }
        }
        return pos;
    }

    /** Índices: (i0,i2,i1) e (i1,i2,i3) por célula, mesma ordem do C++ */
    gerarIndices(): Uint32Array {
        const { larguraGrid: W, profundidadeGrid: D } = this;
        const idx = new Uint32Array((W - 1) * (D - 1) * 6);
        let k = 0;
        for (let z = 0; z < D - 1; ++z) {
            for (let x = 0; x < W - 1; ++x) {
                const i0 = z * W + x, i1 = z * W + x + 1;
                const i2 = (z + 1) * W + x, i3 = (z + 1) * W + x + 1;
                idx[k++] = i0; idx[k++] = i2; idx[k++] = i1;
                idx[k++] = i1; idx[k++] = i2; idx[k++] = i3;
            }
        }
        return idx;
    }

    /** obterAlturaMundo(): interpolação baricêntrica sobre o triângulo da célula */
    obterAlturaMundo(xMundo: number, zMundo: number): number {
        if (this.alturas.length === 0) return 0;
        const { larguraGrid: W, profundidadeGrid: D } = this;
        const esp = this.espacamento, esc = this.escalaOndulacao;
        const offsetX = W * esp * 0.5, offsetZ = D * esp * 0.5;

        // o C++ usa float32; Math.fround reproduz o clamp em 1.001 com a mesma precisão
        let gridX = (xMundo + offsetX) / esp;
        let gridZ = (zMundo + offsetZ) / esp;
        gridX = Math.min(Math.max(gridX, 0), Math.fround(W - 1.001));
        gridZ = Math.min(Math.max(gridZ, 0), Math.fround(D - 1.001));

        const x0 = Math.floor(gridX), z0 = Math.floor(gridZ);
        const x1 = x0 + 1, z1 = z0 + 1;
        const fx = gridX - x0, fz = gridZ - z0;

        const h00 = this.alturas[z0 * W + x0];
        const h10 = this.alturas[z0 * W + x1];
        const h01 = this.alturas[z1 * W + x0];
        const h11 = this.alturas[z1 * W + x1];

        const h = fx + fz < 1.0
            ? h00 + fx * (h10 - h00) + fz * (h01 - h00)
            : h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
        return h * esc;
    }

    /** aplainarSobreCaminho(): usado pela estrada (Etapa 2). Retorna true se alterou alturas. */
    aplainarSobreCaminho(caminho: Vec3[], meiaLargura: number, margemPlana: number,
                         larguraTransicao: number, profundidade: number): boolean {
        if (this.alturas.length === 0 || caminho.length < 2) return false;
        const { larguraGrid: W, profundidadeGrid: D } = this;
        const esp = this.espacamento, esc = this.escalaOndulacao;
        if (esc < 0.0001 || esp < 0.0001) return false;
        const offsetX = W * esp * 0.5, offsetZ = D * esp * 0.5;

        const raioPlano = meiaLargura + margemPlana;
        const raioTotal = raioPlano + larguraTransicao;
        const INF = 1e30;
        const melhorDist = new Float32Array(this.alturas.length).fill(INF);
        const alvo = new Float32Array(this.alturas.length);

        const n = caminho.length;
        for (let i = 0; i < n; ++i) {
            const a = caminho[i], b = caminho[(i + 1) % n];
            const minX = Math.min(a.x, b.x) - raioTotal, maxX = Math.max(a.x, b.x) + raioTotal;
            const minZ = Math.min(a.z, b.z) - raioTotal, maxZ = Math.max(a.z, b.z) + raioTotal;
            const gx0 = Math.max(0, Math.floor((minX + offsetX) / esp));
            const gx1 = Math.min(W - 1, Math.ceil((maxX + offsetX) / esp));
            const gz0 = Math.max(0, Math.floor((minZ + offsetZ) / esp));
            const gz1 = Math.min(D - 1, Math.ceil((maxZ + offsetZ) / esp));

            const abx = b.x - a.x, abz = b.z - a.z;
            const len2 = abx * abx + abz * abz;

            for (let z = gz0; z <= gz1; ++z) {
                for (let x = gx0; x <= gx1; ++x) {
                    const px = x * esp - offsetX, pz = z * esp - offsetZ;
                    const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - a.x) * abx + (pz - a.z) * abz) / len2)) : 0;
                    const d = Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
                    const idx = z * W + x;
                    if (d < melhorDist[idx]) {
                        melhorDist[idx] = d;
                        alvo[idx] = a.y + (b.y - a.y) * t;
                    }
                }
            }
        }

        for (let idx = 0; idx < this.alturas.length; ++idx) {
            const d = melhorDist[idx];
            if (d >= raioTotal) continue;
            const w = 1 - smoothstep(raioPlano, raioTotal, d);
            const alvoNorm = (alvo[idx] - profundidade) / esc;
            this.alturas[idx] = this.alturas[idx] * (1 - w) + alvoNorm * w; // glm::mix
        }
        return true;
    }
}
