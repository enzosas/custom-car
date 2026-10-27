// Veiculo.ts — port de Veiculo.h + Cylinder.h (física arcade, suspensão, pulo, malhas do carro).
// Toda a física roda em unidades "por frame a 60 Hz" (dt60), exatamente como no C++.

import { GAME_CONFIG } from './config';
import { Mat4, type V3, X_AXIS, Y_AXIS, Z_AXIS, clamp, mix, sign, radians, degrees } from './Mat4';

export type Malha = { positions: Float32Array; colors: Float32Array; indices: Uint32Array };
export type AlturaFn = (x: number, z: number) => number;

const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const add = (a: V3, b: V3) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V3, b: V3) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: V3, s: number) => v3(a.x * s, a.y * s, a.z * s);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const cross = (a: V3, b: V3) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: V3) => { const l = len(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
const mixV = (a: V3, b: V3, t: number) => v3(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t));

const lerpFactorDt = (taxaPorFrame: number, dt60: number) => 1 - Math.pow(1 - clamp(taxaPorFrame, 0, 0.9999), dt60);

/** Construtor de malha com winding corrigido (adicionarQuadComNormal) */
class Builder {
    positions: number[] = []; colors: number[] = []; indices: number[] = [];
    n = 0;
    quad(p1: V3, p2: V3, p3: V3, p4: V3, normal: V3, cor: number[]) {
        const s = this.n;
        for (const p of [p1, p2, p3, p4]) { this.positions.push(p.x, p.y, p.z); this.colors.push(cor[0], cor[1], cor[2]); }
        this.n += 4;
        const n = norm(normal);
        const ng = cross(sub(p2, p1), sub(p3, p1));
        if (dot(ng, n) >= 0) this.indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
        else this.indices.push(s, s + 2, s + 1, s, s + 3, s + 2);
    }
    build(): Malha {
        return { positions: new Float32Array(this.positions), colors: new Float32Array(this.colors), indices: new Uint32Array(this.indices) };
    }
}

export function gerarGeometriaChassi(config = GAME_CONFIG, cor = [0.910, 0.435, 0.435]): Malha {
    const dim = config.carro.dimensoes;
    const w2 = dim.largura * 0.5, l2 = dim.comprimento * 0.5, l = dim.comprimento;
    const r = config.carro.rodas.raio;
    const y0 = -r + dim.alturachao, y1 = y0 + dim.alturaporta, y2 = y1 + dim.alturaparabrisa;
    const zTrasTopo = -l2 + l * dim.taxaTopoCockpitTras;
    const zFrenteTopo = -l2 + l * dim.taxaTopoCockpitFrente;
    const zTrasBase = -l2 + l * dim.taxaBaseCockpitTras;
    const zFrenteBase = -l2 + l * dim.taxaBaseCockpitFrente;
    const b = new Builder();
    const P = v3;

    b.quad(P(-w2, y0, l2), P(w2, y0, l2), P(w2, y0, -l2), P(-w2, y0, -l2), P(0, -1, 0), cor);            // fundo
    b.quad(P(-w2, y1, -l2), P(w2, y1, -l2), P(w2, y1, zTrasBase), P(-w2, y1, zTrasBase), P(0, 1, 0), cor); // capô traseiro
    b.quad(P(-w2, y1, zFrenteBase), P(w2, y1, zFrenteBase), P(w2, y1, l2), P(-w2, y1, l2), P(0, 1, 0), cor); // capô dianteiro
    b.quad(P(-w2, y0, -l2), P(w2, y0, -l2), P(w2, y1, -l2), P(-w2, y1, -l2), P(0, 0, -1), cor);          // painel traseiro
    b.quad(P(w2, y0, l2), P(-w2, y0, l2), P(-w2, y1, l2), P(w2, y1, l2), P(0, 0, 1), cor);               // painel frontal
    b.quad(P(-w2, y0, -l2), P(-w2, y0, l2), P(-w2, y1, l2), P(-w2, y1, -l2), P(-1, 0, 0), cor);          // lateral esq.
    b.quad(P(w2, y0, l2), P(w2, y0, -l2), P(w2, y1, -l2), P(w2, y1, l2), P(1, 0, 0), cor);               // lateral dir.
    b.quad(P(-w2, y2, zTrasTopo), P(w2, y2, zTrasTopo), P(w2, y2, zFrenteTopo), P(-w2, y2, zFrenteTopo), P(0, 1, 0), cor); // teto

    const nTras = mul(cross(P(1, 0, 0), P(0, y2 - y1, zTrasTopo - zTrasBase)), -1);
    b.quad(P(w2, y1, zTrasBase), P(-w2, y1, zTrasBase), P(-w2, y2, zTrasTopo), P(w2, y2, zTrasTopo), nTras, cor);
    const nFrente = mul(cross(P(0, y2 - y1, zFrenteTopo - zFrenteBase), P(1, 0, 0)), -1);
    b.quad(P(-w2, y1, zFrenteBase), P(w2, y1, zFrenteBase), P(w2, y2, zFrenteTopo), P(-w2, y2, zFrenteTopo), nFrente, cor);

    b.quad(P(-w2, y1, zTrasBase), P(-w2, y1, zFrenteBase), P(-w2, y2, zFrenteTopo), P(-w2, y2, zTrasTopo), P(-1, 0, 0), cor); // vidro esq.
    b.quad(P(w2, y1, zFrenteBase), P(w2, y1, zTrasBase), P(w2, y2, zTrasTopo), P(w2, y2, zFrenteTopo), P(1, 0, 0), cor);       // vidro dir.
    return b.build();
}

/** Cylinder::generateGeometry */
export function gerarGeometriaCilindro(radius: number, height: number, sectors: number, cor = [0.1, 0.1, 0.1]): Malha {
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const halfH = height * 0.5;
    const sectorStep = 2 * Math.PI / sectors;
    const push = (x: number, y: number, z: number) => { positions.push(x, y, z); colors.push(cor[0], cor[1], cor[2]); };
    let count = 0;
    const add1 = (x: number, y: number, z: number) => { push(x, y, z); return count++; };

    for (let s = 0; s <= sectors; ++s) {
        const a = s * sectorStep;
        const x = radius * Math.cos(a), z = radius * Math.sin(a);
        add1(x, -halfH, z); add1(x, halfH, z);
    }
    for (let s = 0; s < sectors; ++s) {
        const bL = s * 2, tL = bL + 1, bR = (s + 1) * 2, tR = bR + 1;
        indices.push(bL, tL, tR, bL, tR, bR);
    }
    const topCenter = add1(0, halfH, 0);
    const topEdge = count;
    for (let s = 0; s <= sectors; ++s) { const a = s * sectorStep; add1(radius * Math.cos(a), halfH, radius * Math.sin(a)); }
    for (let s = 0; s < sectors; ++s) indices.push(topCenter, topEdge + s, topEdge + s + 1);

    const botCenter = add1(0, -halfH, 0);
    const botEdge = count;
    for (let s = 0; s <= sectors; ++s) { const a = s * sectorStep; add1(radius * Math.cos(a), -halfH, radius * Math.sin(a)); }
    for (let s = 0; s < sectors; ++s) indices.push(botCenter, botEdge + s + 1, botEdge + s);

    return { positions: new Float32Array(positions), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}

export class Veiculo {
    fisica = {
        position: v3(), velocity: v3(), lastVelocity: v3(),
        velocityY: 0, forwardSpeed: 0, lateralSpeed: 0, lastForwardSpeed: 0,
        yawAngle: 0, currentSteer: 0, currentGrip: 0,
        derrapando: false, intensidadeDrift: 0,
    };
    suspensao = {
        chassiPitchAngle: 0, chassiRollAngle: 0, chassiPitchVelocity: 0, chassiRollVelocity: 0,
        terrenoPitchAngle: 0, terrenoRollAngle: 0,
        compressaoPulo: 0, compressaoVel: 0, molaPouso: 0, molaPousoVel: 0,
    };
    pulo = {
        noAr: false, segurando: false, segurandoAnterior: false,
        buffer: 0, carga: 0, alturaChaoAnterior: 0, vyChaoAnterior: 0,
        soloValido: false, pousouNoFrame: false,
    };
    rodas = {
        radius: 1, steerAngle: 0, rollAngle: 0,
        posContato: [v3(), v3(), v3(), v3()] as V3[],   // 0: FE, 1: FD, 2: TE, 3: TD
        eixoLateral: [v3(), v3(), v3(), v3()] as V3[],
    };
    modelMatrix = new Mat4();
    readonly corRodas = [0.15, 0.15, 0.15];

    constructor(private config = GAME_CONFIG) {}

    // ---------- geometria ----------
    gerarMalhaChassi() { return gerarGeometriaChassi(this.config); }
    gerarMalhaRoda() {
        const r = this.config.carro.rodas;
        return gerarGeometriaCilindro(r.raio, r.largura, r.segmentos, this.corRodas);
    }

    init() {
        this.fisica = {
            position: v3(), velocity: v3(), lastVelocity: v3(),
            velocityY: 0, forwardSpeed: 0, lateralSpeed: 0, lastForwardSpeed: 0,
            yawAngle: 0, currentSteer: 0, currentGrip: 0, derrapando: false, intensidadeDrift: 0,
        };
        this.suspensao = {
            chassiPitchAngle: 0, chassiRollAngle: 0, chassiPitchVelocity: 0, chassiRollVelocity: 0,
            terrenoPitchAngle: 0, terrenoRollAngle: 0, compressaoPulo: 0, compressaoVel: 0, molaPouso: 0, molaPousoVel: 0,
        };
        this.pulo = {
            noAr: false, segurando: false, segurandoAnterior: false, buffer: 0, carga: 0,
            alturaChaoAnterior: 0, vyChaoAnterior: 0, soloValido: false, pousouNoFrame: false,
        };
        this.rodas = {
            radius: this.config.carro.rodas.raio, steerAngle: 0, rollAngle: 0,
            posContato: [v3(), v3(), v3(), v3()], eixoLateral: [v3(), v3(), v3(), v3()],
        };
        this.fisica.position = v3(0, this.rodas.radius, 0);
        this.fisica.currentGrip = this.config.carro.fisica.aderenciaPista;
        this.modelMatrix = Mat4.translation(this.fisica.position);
    }

    /** chamado quando as dimensões mudam no painel */
    reconstruirGeometria() { this.rodas.radius = this.config.carro.rodas.raio; }

    // ---------- suspensão ----------
    private limiteCompressao() { return Math.max(0, this.config.carro.dimensoes.alturachao * 0.95); }
    private deslocamentoCarroceria() {
        return clamp(this.suspensao.compressaoPulo + this.suspensao.molaPouso, -0.8, this.limiteCompressao());
    }

    private atualizarCompressao(dt: number) {
        const fis = this.config.carro.fisica, s = this.suspensao;
        const limiteSup = Math.max(0, this.config.carro.dimensoes.alturachao * 0.95);
        const maxComp = clamp(fis.compressaoPulo, 0, limiteSup);
        const alvo = (!this.pulo.noAr && this.pulo.segurando) ? maxComp * this.pulo.carga : 0;
        const K = fis.suspensaoRigidez, C = fis.suspensaoAmortecimento;
        const passos = Math.max(1, Math.ceil(dt / 0.008));
        const h = dt / passos;
        for (let i = 0; i < passos; ++i) {
            const forca = (alvo - s.compressaoPulo) * K - s.compressaoVel * C;
            s.compressaoVel += forca * h;
            s.compressaoPulo += s.compressaoVel * h;
            if (s.compressaoPulo > limiteSup) { s.compressaoPulo = limiteSup; if (s.compressaoVel > 0) s.compressaoVel = 0; }
            else if (s.compressaoPulo < -0.6) { s.compressaoPulo = -0.6; if (s.compressaoVel < 0) s.compressaoVel = 0; }
        }
    }

    private atualizarMolaPouso(dt: number) {
        const fis = this.config.carro.fisica, s = this.suspensao;
        const limiteSup = this.limiteCompressao();
        const k = Math.max(1, fis.suspensaoRigidez), c = Math.max(0, fis.suspensaoAmortecimento);
        const omega = Math.sqrt(k);
        const hMax = Math.min(0.008, 0.25 / omega);
        const passos = Math.max(1, Math.ceil(dt / hMax));
        const h = dt / passos;
        for (let i = 0; i < passos; ++i) {
            const forca = -s.molaPouso * k - s.molaPousoVel * c;
            s.molaPousoVel += forca * h;
            s.molaPouso += s.molaPousoVel * h;
            if (s.molaPouso > limiteSup) { s.molaPouso = limiteSup; if (s.molaPousoVel > 0) s.molaPousoVel = 0; }
            else if (s.molaPouso < -0.8) { s.molaPouso = -0.8; if (s.molaPousoVel < 0) s.molaPousoVel = 0; }
        }
    }

    // ---------- vertical: pulo, decolagem natural, aterrissagem ----------
    private atualizarVertical(alturaChao: number, dt: number) {
        const fis = this.config.carro.fisica, p = this.pulo, f = this.fisica;
        const g = Math.max(0, fis.gravidade);

        p.pousouNoFrame = false;
        const soloConhecido = p.soloValido;
        const vyChaoAnt = p.vyChaoAnterior;
        const vyChao = soloConhecido ? (alturaChao - p.alturaChaoAnterior) / dt : 0;

        p.alturaChaoAnterior = alturaChao;
        p.vyChaoAnterior = vyChao;
        p.soloValido = true;

        const soltou = p.segurandoAnterior && !p.segurando;
        p.segurandoAnterior = p.segurando;

        if (p.buffer > 0) p.buffer -= dt;

        if (!p.noAr) {
            if (p.segurando) p.carga = Math.min(1, p.carga + dt / Math.max(0.05, fis.tempoCargaPulo));

            if (soltou || p.buffer > 0) {
                const fatorMin = clamp(fis.fatorPuloMinimo, 0, 1);
                const forca = fis.forcaPulo * mix(fatorMin, 1, p.carga);
                f.velocityY = vyChaoAnt + forca;
                this.suspensao.compressaoVel -= forca * 0.25;
                p.noAr = true; p.carga = 0; p.buffer = 0;
            } else if (soloConhecido) {
                const yBalistico = f.position.y + vyChaoAnt * dt - 0.5 * g * dt * dt;
                const desvio = (yBalistico - alturaChao) / dt;
                if (desvio > fis.limiarDecolagem) { f.velocityY = vyChaoAnt; p.noAr = true; }
            }
            if (!p.noAr) f.position.y = alturaChao;
        } else {
            p.carga = 0;
            if (soltou) p.buffer = 0.12;
            f.velocityY -= g * dt;
            f.position.y += f.velocityY * dt;
            if (f.position.y <= alturaChao) {
                const impacto = Math.max(0, vyChao - f.velocityY);
                f.position.y = alturaChao;
                f.velocityY = 0;
                p.noAr = false;
                this.suspensao.molaPousoVel += Math.min(impacto * 0.6 * fis.reacaoPouso, 90);
                p.pousouNoFrame = true;
            }
        }
        this.atualizarCompressao(dt);
        this.atualizarMolaPouso(dt);
    }

    // ---------- direção e aceleração ----------
    private atualizarDirecaoEAceleracao(dt60: number, throttle: number, steer: number) {
        const fis = this.config.carro.fisica, f = this.fisica;
        const maxSpeed = Math.max(0.01, fis.velmax);
        const maxReverseSpeed = -Math.abs(fis.velmaxre);

        f.currentSteer = mix(f.currentSteer, steer, lerpFactorDt(fis.taxaLerpVolante, dt60));

        const fatorVelocidadeGiro = clamp(Math.abs(f.lastForwardSpeed) / Math.max(0.001, fis.velReferenciaGiro), 0, 1);
        const direcaoMovimento = f.lastForwardSpeed < -0.01 ? -1 : 1;
        f.yawAngle += f.currentSteer * fis.velocidadeGiro * fatorVelocidadeGiro * direcaoMovimento * (this.pulo.noAr ? 0.35 : 1) * dt60;

        if (!this.pulo.noAr && throttle > 0) {
            if (f.forwardSpeed < 0) {
                f.forwardSpeed += throttle * fis.aceleracaoFreio * dt60;
            } else if (f.forwardSpeed < maxSpeed) {
                const speedRatio = clamp(f.forwardSpeed / maxSpeed, 0, 1);
                const engineEfficiency = Math.max(0.15, 1 - (speedRatio * speedRatio * 0.85));
                f.forwardSpeed += throttle * fis.aceleracao * engineEfficiency * dt60;
                if (f.forwardSpeed > maxSpeed) f.forwardSpeed = maxSpeed;
            }
        } else if (!this.pulo.noAr && throttle < 0) {
            if (f.forwardSpeed > 0.05) {
                f.forwardSpeed += throttle * fis.aceleracaoFreio * dt60;
                if (f.forwardSpeed < 0) f.forwardSpeed = 0;
            } else if (f.forwardSpeed > maxReverseSpeed) {
                const revRatio = clamp(Math.abs(f.forwardSpeed) / Math.max(0.01, Math.abs(maxReverseSpeed)), 0, 1);
                const revEfficiency = Math.max(0.20, 1 - (revRatio * revRatio * 0.80));
                f.forwardSpeed += throttle * fis.aceleracao * revEfficiency * dt60;
                if (f.forwardSpeed < maxReverseSpeed) f.forwardSpeed = maxReverseSpeed;
            }
        } else if (!this.pulo.noAr) {
            const speedAbs = Math.abs(f.forwardSpeed);
            const dragQuad = fis.arrastoQuadratico * (speedAbs * speedAbs);
            f.forwardSpeed *= Math.pow(clamp(fis.atritoEscalar, 0, 1), dt60);
            const fatorArrasto = clamp((fis.atritoLinear + dragQuad) * dt60, 0, 1);
            f.forwardSpeed -= f.forwardSpeed * fatorArrasto;
        }

        if (f.forwardSpeed > maxSpeed) f.forwardSpeed = mix(f.forwardSpeed, maxSpeed, lerpFactorDt(0.05, dt60));
        f.lastForwardSpeed = f.forwardSpeed;
    }

    // ---------- atrito lateral / drift ----------
    private atualizarAtritoELateral(dt60: number, handbrake: boolean, throttle: number) {
        const fis = this.config.carro.fisica, f = this.fisica;

        f.currentGrip = handbrake ? fis.aderenciaFreioDeMao
            : mix(f.currentGrip, fis.aderenciaPista, lerpFactorDt(fis.taxaRecuperacaoGrip, dt60));

        const velTotal = len(f.velocity);
        const deslizeLateral = Math.abs(f.lateralSpeed);
        let gripEfetivo = f.currentGrip;

        const aceleracaoNormal = fis.aderenciaPista * Math.max(0, fis.gravidade);
        const escalaFisica = Math.sqrt(aceleracaoNormal / 4.5);
        const velCorteManobra = Math.max(0.1, 1.2 * escalaFisica);
        const emManobraLenta = !handbrake && deslizeLateral < 0.05;

        if (emManobraLenta) {
            const fatorBaixaVel = clamp(velTotal / velCorteManobra, 0, 1);
            gripEfetivo = mix(1, f.currentGrip, fatorBaixaVel);
        }

        const retencaoLateral = Math.pow(clamp(1 - gripEfetivo, 0, 1), dt60);
        if (!this.pulo.noAr) {
            f.lateralSpeed *= retencaoLateral;
            const fatorAtritoLinear = clamp(1 - (velTotal / velCorteManobra), 0, 1);
            const fatorGravidade = Math.max(0, fis.gravidade) / 150;
            const desaceleracaoLinear = (emManobraLenta ? (fis.aderenciaPista * fatorGravidade * 0.4 * fatorAtritoLinear) : 0) * dt60;
            if (Math.abs(f.lateralSpeed) <= desaceleracaoLinear) f.lateralSpeed = 0;
            else f.lateralSpeed -= sign(f.lateralSpeed) * desaceleracaoLinear;
        }

        const limiar = Math.max(0.01, fis.limiarDriftRastro);
        f.derrapando = !this.pulo.noAr && velTotal > 0.40 && (handbrake || deslizeLateral > limiar);
        f.intensidadeDrift = clamp(deslizeLateral / (limiar * 6), 0.20, 0.50);

        if (Math.abs(throttle) < 0.001 && velTotal < 0.15) {
            const fatorParada = lerpFactorDt(0.10, dt60);
            f.velocity = mixV(f.velocity, v3(), fatorParada);
            f.lastForwardSpeed = mix(f.lastForwardSpeed, 0, fatorParada);
            if (velTotal < 0.005) { f.velocity = v3(); f.lastForwardSpeed = 0; }
        }
    }

    // ---------- inclinação inercial do chassi ----------
    private atualizarInclinacaoChassi(dt: number, dt60: number, forward: V3, right: V3) {
        const fis = this.config.carro.fisica, f = this.fisica, s = this.suspensao;
        const globalAccel = mul(sub(f.velocity, f.lastVelocity), 1 / dt60);
        f.lastVelocity = { ...f.velocity };

        let tx = dot(globalAccel, right) * fis.suspensaoRigidez;
        let ty = -dot(globalAccel, forward) * fis.suspensaoRigidez;

        const inclinacaoTotal = Math.hypot(tx, ty);
        if (inclinacaoTotal > fis.suspensaoInclinacaoMax) {
            const k = fis.suspensaoInclinacaoMax / inclinacaoTotal;
            tx *= k; ty *= k;
        }

        const forcaPitch = (ty - s.chassiPitchAngle) * fis.suspensaoRigidez - (s.chassiPitchVelocity * fis.suspensaoAmortecimento);
        const forcaRoll = (tx - s.chassiRollAngle) * fis.suspensaoRigidez - (s.chassiRollVelocity * fis.suspensaoAmortecimento);

        s.chassiPitchVelocity += forcaPitch * dt;
        s.chassiRollVelocity += forcaRoll * dt;
        s.chassiPitchAngle += s.chassiPitchVelocity * dt;
        s.chassiRollAngle += s.chassiRollVelocity * dt;
    }

    // ---------- rodas: contato, atitude, esterçamento ----------
    private calcularPosicoesRodas(dt: number, dt60: number, forward: V3, right: V3, alturaFn?: AlturaFn) {
        const dim = this.config.carro.dimensoes, fis = this.config.carro.fisica;
        const f = this.fisica, s = this.suspensao, r = this.rodas;
        const w2 = dim.largurarodas * 0.5, l2 = dim.comprimentorodas * 0.5;

        const posFE = sub(add(f.position, mul(forward, l2)), mul(right, w2));
        const posFD = add(add(f.position, mul(forward, l2)), mul(right, w2));
        const posTE = sub(sub(f.position, mul(forward, l2)), mul(right, w2));
        const posTD = add(sub(f.position, mul(forward, l2)), mul(right, w2));

        if (alturaFn) {
            const hFE = alturaFn(posFE.x, posFE.z), hFD = alturaFn(posFD.x, posFD.z);
            const hTE = alturaFn(posTE.x, posTE.z), hTD = alturaFn(posTD.x, posTD.z);

            const alturaMediaSolo = (hFE + hFD + hTE + hTD) * 0.25;
            this.atualizarVertical(alturaMediaSolo + r.radius, dt);

            const deltaZ = Math.max(0.001, dim.comprimentorodas);
            const deltaX = Math.max(0.001, dim.largura);

            const pitchAlvo = -degrees(Math.atan2(((hFE + hFD) * 0.5) - ((hTE + hTD) * 0.5), deltaZ));
            const rollAlvo = degrees(Math.atan2(((hFD + hTD) * 0.5) - ((hFE + hTE) * 0.5), deltaX));

            if (this.pulo.pousouNoFrame) {
                const lim = Math.max(0, fis.suspensaoInclinacaoMax);
                s.chassiPitchAngle += clamp((s.terrenoPitchAngle - pitchAlvo) * 0.5 * fis.reacaoPouso, -lim, lim);
                s.chassiRollAngle += clamp((s.terrenoRollAngle - rollAlvo) * 0.5 * fis.reacaoPouso, -lim, lim);
            }

            if (!this.pulo.noAr) {
                const fator = lerpFactorDt(0.20, dt60);
                s.terrenoPitchAngle = mix(s.terrenoPitchAngle, pitchAlvo, fator);
                s.terrenoRollAngle = mix(s.terrenoRollAngle, rollAlvo, fator);
            } else {
                const velHorizontal = len(f.velocity) * 60;
                const fatorAtitude = clamp(velHorizontal / 150, 0, 1);
                const pitchAr = clamp(-degrees(Math.atan2(f.velocityY, Math.max(velHorizontal, 1))), -25, 25) * fatorAtitude;
                const fator = lerpFactorDt(0.04, dt60);
                s.terrenoPitchAngle = mix(s.terrenoPitchAngle, pitchAr, fator);
                s.terrenoRollAngle = mix(s.terrenoRollAngle, 0, fator);
            }

            r.posContato[0] = v3(posFE.x, hFE, posFE.z);
            r.posContato[1] = v3(posFD.x, hFD, posFD.z);
            r.posContato[2] = v3(posTE.x, hTE, posTE.z);
            r.posContato[3] = v3(posTD.x, hTD, posTD.z);
        } else {
            const off = v3(0, r.radius, 0);
            r.posContato[0] = sub(posFE, off); r.posContato[1] = sub(posFD, off);
            r.posContato[2] = sub(posTE, off); r.posContato[3] = sub(posTD, off);
        }

        // esterçamento visual (Ackermann simplificado)
        const curvaturaMax = fis.velocidadeGiro / Math.max(0.001, fis.velReferenciaGiro);
        const anguloFisicoRadMax = Math.atan(dim.comprimentorodas * curvaturaMax);
        r.steerAngle = degrees(anguloFisicoRadMax * f.currentSteer);

        const radSteer = radians(r.steerAngle);
        const rightDianteiro = norm(v3(
            right.x * Math.cos(radSteer) + forward.x * Math.sin(radSteer), 0,
            right.z * Math.cos(radSteer) + forward.z * Math.sin(radSteer)));
        r.eixoLateral[0] = rightDianteiro; r.eixoLateral[1] = rightDianteiro;
        r.eixoLateral[2] = right; r.eixoLateral[3] = right;

        const forwardDistance = f.forwardSpeed * dt60;
        r.rollAngle = (r.rollAngle + degrees(forwardDistance / r.radius)) % 360;
    }

    /** update(): um passo da simulação */
    update(deltaTime: number, throttle: number, steer: number, handbrake = false, alturaFn?: AlturaFn) {
        const dt = clamp(deltaTime, 0.0001, 0.1);
        const dt60 = dt * 60;
        const f = this.fisica;

        f.forwardSpeed = dot(f.velocity, v3(Math.sin(f.yawAngle), 0, Math.cos(f.yawAngle)));
        f.lateralSpeed = dot(f.velocity, v3(Math.cos(f.yawAngle), 0, -Math.sin(f.yawAngle)));

        const forward = v3(Math.sin(f.yawAngle), 0, Math.cos(f.yawAngle));
        const right = v3(Math.cos(f.yawAngle), 0, -Math.sin(f.yawAngle));

        this.atualizarDirecaoEAceleracao(dt60, throttle, steer);
        this.atualizarAtritoELateral(dt60, handbrake, throttle);

        f.velocity = add(mul(forward, f.forwardSpeed), mul(right, f.lateralSpeed));

        this.atualizarInclinacaoChassi(dt, dt60, forward, right);
        f.position = add(f.position, mul(f.velocity, dt60));

        this.calcularPosicoesRodas(dt, dt60, forward, right, alturaFn);

        let m = Mat4.translation(f.position);
        m = m.rotate(f.yawAngle, Y_AXIS);
        m = m.rotate(radians(this.suspensao.terrenoPitchAngle), X_AXIS);
        m = m.rotate(radians(this.suspensao.terrenoRollAngle), Z_AXIS);
        this.modelMatrix = m;
    }

    /** matriz do chassi (com compressão e inclinação inercial) */
    matrizChassi(): Mat4 {
        let m = this.modelMatrix.translate(v3(0, -this.deslocamentoCarroceria(), 0));
        m = m.rotate(radians(this.suspensao.chassiPitchAngle), X_AXIS);
        m = m.rotate(radians(this.suspensao.chassiRollAngle), Z_AXIS);
        return m;
    }

    /** matrizes das 4 rodas (FE, FD, TE, TD) */
    matrizesRodas(): Mat4[] {
        const w2 = this.config.carro.dimensoes.largurarodas / 2;
        const l2 = this.config.carro.dimensoes.comprimentorodas / 2;
        const offsets = [v3(-w2, 0, l2), v3(w2, 0, l2), v3(-w2, 0, -l2), v3(w2, 0, -l2)];
        return offsets.map((o, i) => {
            let m = this.modelMatrix.translate(o);
            if (i < 2) m = m.rotate(radians(this.rodas.steerAngle), Y_AXIS);
            m = m.rotate(radians(this.rodas.rollAngle), X_AXIS);
            m = m.rotate(radians(90), Z_AXIS);
            return m;
        });
    }

    // ---------- consultas ----------
    getPosicao() { return this.fisica.position; }
    getYawAngle() { return this.fisica.yawAngle; }
    getVelocidade() { return len(this.fisica.velocity); }
    getVelocidadeVetor() { return this.fisica.velocity; }
    setSegurandoPulo(s: boolean) { this.pulo.segurando = s; }
    estaNoAr() { return this.pulo.noAr; }
    estaDerrapando() { return this.fisica.derrapando; }
    getIntensidadeDrift() { return this.fisica.intensidadeDrift; }
    getPosContatoRoda(i: number) { return this.rodas.posContato[i]; }
    getEixoLateralRoda(i: number) { return this.rodas.eixoLateral[i]; }

    invalidarSolo() {
        this.pulo.soloValido = false;
        this.pulo.vyChaoAnterior = 0;
        this.fisica.velocityY = 0;
        this.pulo.noAr = false;
    }

    getAlturaTeto() {
        const dim = this.config.carro.dimensoes;
        return -this.rodas.radius + dim.alturachao + dim.alturaporta + dim.alturaparabrisa;
    }

    reposicionarNaPista(posicaoLargada: V3, direcaoFrente: V3) {
        this.init();
        this.fisica.position = v3(posicaoLargada.x, posicaoLargada.y + this.rodas.radius, posicaoLargada.z);
        this.fisica.yawAngle = Math.atan2(direcaoFrente.x, direcaoFrente.z);
        this.modelMatrix = Mat4.translation(this.fisica.position).rotate(this.fisica.yawAngle, Y_AXIS);
    }
}
