// PilotoAutomatico.ts — port de PilotoAutomatico.h (pure pursuit + perfil de frenagem antecipada).

import { GAME_CONFIG } from './config';
import { clamp } from './Mat4';
import type { Veiculo } from './Veiculo';
import type { Estrada } from './Estrada';

type V2 = { x: number; y: number };
const xz = (v: { x: number; z: number }): V2 => ({ x: v.x, y: v.z });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const addv = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const mulv = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
const dot2 = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
const len2 = (a: V2) => Math.hypot(a.x, a.y);

/** normaliza um ângulo para [-pi, pi] */
function angulo(a: number) {
    while (a > 3.14159265) a -= 6.28318531;
    while (a < -3.14159265) a += 6.28318531;
    return a;
}

function pontoAFrente(curva: { x: number; z: number }[], seg: number, t: number, dist: number): V2 {
    const n = curva.length;
    let i = seg;
    const A = xz(curva[i]);
    let B = xz(curva[(i + 1) % n]);
    let p = addv(A, mulv(sub(B, A), t));
    let restante = dist;
    for (let guard = 0; guard < n; ++guard) {
        const v = sub(B, p);
        const d = len2(v);
        if (d >= restante) {
            if (d > 1e-5) return addv(p, mulv(v, restante / d));
            return p;
        }
        restante -= d;
        p = B;
        i = (i + 1) % n;
        B = xz(curva[(i + 1) % n]);
    }
    return p;
}

function curvatura(curva: { x: number; z: number }[], i: number): number {
    const n = curva.length, k = 3;
    const a = sub(xz(curva[i]), xz(curva[(i - k + n) % n]));
    const b = sub(xz(curva[(i + k) % n]), xz(curva[i]));
    const la = len2(a), lb = len2(b);
    if (la < 1e-3 || lb < 1e-3) return 0;
    const c = clamp(dot2(a, b) / (la * lb), -1, 1);
    return Math.acos(c) / (0.5 * (la + lb));
}

export class PilotoAutomatico {
    private steerEstimado = 0;
    private yawAnterior = 0;
    private temYawAnterior = false;
    private temTempo = false;
    private ultimoTempo = 0;

    constructor(private config = GAME_CONFIG) {}

    atualizar(veiculo: Veiculo, estrada: Estrada): { throttle: number; steer: number; handbrake: boolean } {
        const saida = { throttle: 0, steer: 0, handbrake: false };
        if (!veiculo || !estrada) return saida;

        const curva = estrada.getPontosCurva();
        const n = curva.length;
        if (n < 8) return saida;

        const fis = this.config.carro.fisica;
        const pConf = this.config.pilotoAutomatico.parametros;

        // delta de tempo real, limitado a 0.05 s e convertido para a base de 60 Hz
        let dt60 = 1;
        const agora = performance.now() / 1000;
        if (this.temTempo) {
            const dt = Math.min(Math.max(agora - this.ultimoTempo, 0.0001), 0.05);
            dt60 = dt * 60;
        }
        this.ultimoTempo = agora;
        this.temTempo = true;

        const pos3 = veiculo.getPosicao(), vel3 = veiculo.getVelocidadeVetor();
        const pos: V2 = { x: pos3.x, y: pos3.z };
        const vel: V2 = { x: vel3.x, y: vel3.z };
        const speed = len2(vel);
        const yaw = veiculo.getYawAngle();

        const omegaMax = Math.max(1e-4, fis.velocidadeGiro);
        const grip = Math.max(1e-4, fis.aderenciaPista);

        // estimativa do esterçamento real (a interpolação do volante cria atraso)
        if (this.temYawAnterior) {
            const dYaw = angulo(yaw - this.yawAnterior);
            const fatorVel = Math.min(Math.max(speed / Math.max(0.001, fis.velReferenciaGiro), 0.2), 1);
            let bruto = dYaw / (omegaMax * dt60 * fatorVel);
            bruto = Math.min(Math.max(bruto, -1), 1);
            this.steerEstimado += (bruto - this.steerEstimado) * 0.5;
        } else {
            this.steerEstimado = 0;
        }
        this.yawAnterior = yaw;
        this.temYawAnterior = true;

        // vértice mais próximo
        let closest = 0, minD2 = 1e30;
        for (let i = 0; i < n; ++i) {
            const d = sub(pos, xz(curva[i]));
            const d2 = dot2(d, d);
            if (d2 < minD2) { minD2 = d2; closest = i; }
        }

        // projeção nos dois segmentos vizinhos
        let seg = closest, tSeg = 0, melhor = 1e30;
        for (let k = -1; k <= 0; ++k) {
            const i = (closest + k + n) % n;
            const A = xz(curva[i]);
            const AB = sub(xz(curva[(i + 1) % n]), A);
            const l2 = dot2(AB, AB);
            const t = l2 > 0 ? clamp(dot2(sub(pos, A), AB) / l2, 0, 1) : 0;
            const d = len2(sub(pos, addv(A, mulv(AB, t))));
            if (d < melhor) { melhor = d; seg = i; tSeg = t; }
        }

        const foraDaPista = !estrada.estaNoAsfalto(pos3.x, pos3.z);
        const meiaLargura = this.config.estrada.estrada.largura * 0.5;

        // direção efetiva do movimento (mistura com o yaw em baixa velocidade)
        const w = clamp(speed / 1.5, 0, 1);
        let phiV = yaw;
        if (speed > 1e-4) phiV = yaw + w * angulo(Math.atan2(vel.x, vel.y) - yaw);

        const lookahead = foraDaPista ? pConf.lookaheadForaPista : (pConf.lookaheadBase + speed * pConf.lookaheadVel);
        let alvo = pontoAFrente(curva, seg, tSeg, lookahead);

        // deslocamento do alvo para o lado de dentro da curva (traçado)
        if (pConf.fatorLinha > 0 && !foraDaPista) {
            const d = 150;
            const pm = pontoAFrente(curva, seg, tSeg, Math.max(lookahead - d, 1));
            const pp = pontoAFrente(curva, seg, tSeg, lookahead + d);
            const a = sub(alvo, pm), b = sub(pp, alvo);
            if (len2(a) > 1e-3 && len2(b) > 1e-3) {
                const ang = Math.atan2(a.x * b.y - a.y * b.x, dot2(a, b));
                const ks = ang / d;
                const dd = sub(pp, pm);
                const ld = len2(dd) || 1;
                const tg = { x: dd.x / ld, y: dd.y / ld };
                const rv = { x: tg.y, y: -tg.x };
                const mag = pConf.fatorLinha * Math.max(meiaLargura - pConf.margemLinha, 0);
                const kRef = 1 / Math.max(pConf.raioRefLinha, 1);
                alvo = addv(alvo, mulv(rv, mag * clamp(-ks / kRef, -1, 1)));
            }
        }

        const paraAlvo = sub(alvo, pos);
        const L = len2(paraAlvo);
        if (L < 1e-3) return saida;

        const phiT = Math.atan2(paraAlvo.x, paraAlvo.y);
        const eV = angulo(phiT - phiV);
        const sn = Math.cos(eV) >= 0 ? Math.sin(eV) : (eV >= 0 ? 1 : -1);

        const dphi = 2 * sn * Math.max(speed, 1) / L;
        const x = clamp(2 * dphi / grip, -0.95, 0.95);
        const beta = 0.5 * Math.asin(x);

        const errDir = angulo(phiT - yaw);
        const errSlip = angulo(phiV + beta - yaw);
        const errYaw = errDir + (errSlip - errDir) * w;

        const psiRate = pConf.kYaw * errYaw + dphi * w;
        const sDes = clamp(psiRate / omegaMax, -1, 1);

        let u = sDes;
        if (speed > 0.3) u = sDes + pConf.kLead * (sDes - this.steerEstimado);
        saida.steer = clamp(u, -1, 1);

        // perfil de velocidade: freia antes das curvas
        const aFreio = Math.max(1e-4, fis.aceleracaoFreio * pConf.fatorFreio);
        const distMax = (fis.velmax * fis.velmax) / (2 * aFreio) + 200;

        let vAlvo = fis.velmax;
        let acum = 0;
        for (let s = 0; s < n && acum <= distMax; ++s) {
            const i = (seg + s) % n;
            const kappa = curvatura(curva, i);
            let vc = pConf.fatorVelCurva * (grip * 0.5) / Math.max(kappa, 1e-5);
            vc = Math.max(vc, pConf.velMinCurva);
            vAlvo = Math.min(vAlvo, Math.sqrt(vc * vc + 2 * aFreio * acum));
            acum += len2(sub(xz(curva[(i + 1) % n]), xz(curva[i])));
        }
        if (foraDaPista) vAlvo = Math.min(vAlvo, 3);

        const err = vAlvo - speed;
        saida.throttle = err > -0.15 ? 1 : Math.max((err + 0.15) * 4, -1);
        return saida;
    }
}
