// Veiculo.ts — port de Veiculo.h + Cylinder.h (física arcade, suspensão, pulo, malhas do carro).
// Toda a física roda em unidades "por frame a 60 Hz" (dt60), exatamente como no C++.

import { GAME_CONFIG } from '@/core/config';
import { Mat4, type V3, X_AXIS, Y_AXIS, Z_AXIS, clamp, mix, sign, radians, degrees, lerpFactorDt } from '@/graphics/Mat4';
import { v3, add, sub, mul, dot, len, cross, norm, mixV } from '@/graphics/vec';
import type { Malha } from '@/graphics/Malha';

export type AlturaFn = (x: number, z: number) => number;

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

const estadoFisicaInicial = () => ({
    position: v3(), velocity: v3(), lastVelocity: v3(),
    velocityY: 0, forwardSpeed: 0, lateralSpeed: 0, lastForwardSpeed: 0,
    yawAngle: 0, currentSteer: 0, currentGrip: 0,
    derrapando: false, intensidadeDrift: 0,
});
/** uma mola amortecida: posição e velocidade (ver integrarMola) */
interface Mola { x: number; v: number }
const mola = (): Mola => ({ x: 0, v: 0 });

const estadoSuspensaoInicial = () => ({
    // a carroceria, presa ao carro por UMA mola nos três eixos
    altura: mola(),     // quanto afundou (+) ou subiu (-) em relação à posição normal; pulo, pouso e relevo empurram esta mola
    pitch: mola(),      // graus: inclinação para frente/trás
    roll: mola(),       // graus: inclinação para os lados
    // base do carro: segue a inclinação do terreno (no chão) ou a atitude do salto (no ar)
    terrenoPitchAngle: 0, terrenoRollAngle: 0,
    // referências do relevo, suavizadas, só do chão: de onde sai a reação da carroceria ao relevo. Não dá para usar a
    // base acima, porque no ar ela segue o salto e, ao pousar, a reação contaria o pouso uma segunda vez
    soloPitchSuave: 0, soloRollSuave: 0, vySoloSuave: 0,
});

/** ajustes internos da suspensão (o painel só mostra grandezas reais: ver SUSPENSAO_BASE em config.ts) */
const SUSP = {
    passoMax: 0.008,              // s: passo máximo da integração das molas (estável mesmo com o jogo travando)
    fracaoAlturaChao: 0.95,       // a carroceria nunca afunda mais que esta fração da altura do chão (não atravessa o chão)
    impulsoPulo: 0.25,            // ao pular, a carroceria é empurrada para cima com esta fração da força do pulo
    impulsoPouso: 0.6,            // ao pousar, a carroceria segue descendo com esta fração da velocidade do impacto
                                  // (o resto o pneu absorve); o curso da suspensão segura o excesso
    trancoPousoAngular: 0.5,      // ao pousar torto, a carroceria herda esta fração da diferença de inclinação
    ganhoRelevoAngular: 0.5,      // quanto das mudanças de inclinação do terreno chega à carroceria (o pneu filtra o resto)
    ganhoRelevoVertical: 0.15,    // idem para vales e cristas
    aderenciaPneu: 1.0,           // em "g": a aceleração que inclina a carroceria nunca passa disso (as curvas do jogo são
                                  // arcade e chegam a vários g; um pneu de verdade não segura muito mais que 1g)
    amortMin: 0.05, amortMax: 1.0,// faixa do amortecimento relativo
    suavRelevoVertical: 0.25,     // suavização (por frame a 60 Hz) das referências do relevo...
    suavRelevoAngular: 0.15,
    suavTerreno: 0.20,            // ...da base seguindo o terreno...
    suavAtitudeAr: 0.04,          // ...e da base seguindo o salto
};

/**
 * Um passo da mola `m` puxada para `alvo` (Euler semi-implícito em subpassos, para não explodir com dt grande).
 * `k` e `c` vêm de constantesMola; a posição fica entre `min` e `max` (batendo no limite, a velocidade para).
 */
function integrarMola(m: Mola, alvo: number, k: number, c: number, dt: number, min: number, max: number) {
    const passos = Math.max(1, Math.ceil(dt / Math.min(SUSP.passoMax, 0.25 / Math.sqrt(Math.max(k, 1e-6)))));
    const h = dt / passos;
    for (let i = 0; i < passos; ++i) {
        m.v += ((alvo - m.x) * k - m.v * c) * h;
        m.x += m.v * h;
        if (m.x > max) { m.x = max; if (m.v > 0) m.v = 0; }
        else if (m.x < min) { m.x = min; if (m.v < 0) m.v = 0; }
    }
}

/** frequência (Hz) e amortecimento relativo -> rigidez e amortecimento da mola (por unidade de massa) */
function constantesMola(frequencia: number, amortecimento: number) {
    const w = 2 * Math.PI * Math.max(0.01, frequencia);
    return { k: w * w, c: 2 * clamp(amortecimento, SUSP.amortMin, SUSP.amortMax) * w };
}
const estadoPuloInicial = () => ({
    noAr: false, segurando: false, segurandoAnterior: false,
    buffer: 0, carga: 0, alturaChaoAnterior: 0, vyChaoAnterior: 0,
    soloValido: false, pousouNoFrame: false,
});
const estadoRodasInicial = (radius: number) => ({
    radius, steerAngle: 0, rollAngle: 0,
    posContato: [v3(), v3(), v3(), v3()] as V3[],   // 0: FE, 1: FD, 2: TE, 3: TD
    eixoLateral: [v3(), v3(), v3(), v3()] as V3[],
});

export class Veiculo {
    fisica = estadoFisicaInicial();
    suspensao = estadoSuspensaoInicial();
    pulo = estadoPuloInicial();
    rodas = estadoRodasInicial(1);
    modelMatrix = new Mat4();
    readonly corRodas = [0.15, 0.15, 0.15];

    constructor(private config = GAME_CONFIG) { }

    // ---------- geometria ----------
    gerarMalhaChassi() { return gerarGeometriaChassi(this.config); }
    gerarMalhaRoda() {
        const r = this.config.carro.rodas;
        return gerarGeometriaCilindro(r.raio, r.largura, r.segmentos, this.corRodas);
    }

    init() {
        this.fisica = estadoFisicaInicial();
        this.suspensao = estadoSuspensaoInicial();
        this.pulo = estadoPuloInicial();
        this.rodas = estadoRodasInicial(this.config.carro.rodas.raio);
        this.fisica.position = v3(0, this.rodas.radius, 0);
        this.fisica.currentGrip = this.config.carro.fisica.aderenciaPista;
        this.modelMatrix = Mat4.translation(this.fisica.position);
    }

    /** chamado quando as dimensões mudam no painel */
    reconstruirGeometria() { this.rodas.radius = this.config.carro.rodas.raio; }

    // ---------- suspensão ----------
    /** curso que vale: o da config, mas nunca maior que a distância até o chão (a carroceria não atravessa o chão) */
    private limiteCompressao() {
        const curso = Math.max(0, this.config.carro.suspensao.curso);
        return Math.min(curso, Math.max(0, this.config.carro.dimensoes.alturachao * SUSP.fracaoAlturaChao));
    }

    /** ângulos máximos (graus): um lado do carro no fim do curso para cima e o outro no fim do curso para baixo */
    private limitesAngulo() {
        const dim = this.config.carro.dimensoes, curso = this.limiteCompressao();
        return {
            pitch: degrees(Math.atan2(2 * curso, Math.max(0.1, dim.comprimentorodas))),
            roll: degrees(Math.atan2(2 * curso, Math.max(0.1, dim.largurarodas))),
        };
    }
    private deslocamentoCarroceria() { return this.suspensao.altura.x; }
    private molaSuspensao() { const su = this.config.carro.suspensao; return constantesMola(su.frequencia, su.amortecimento); }

    /** altura da carroceria: a mola puxa para a posição normal, ou para baixo enquanto o pulo é carregado */
    private atualizarAltura(dt: number) {
        const limiteSup = this.limiteCompressao();
        const maxComp = clamp(this.config.carro.fisica.compressaoPulo, 0, limiteSup);
        const alvo = (!this.pulo.noAr && this.pulo.segurando) ? maxComp * this.pulo.carga : 0;
        const { k, c } = this.molaSuspensao();
        integrarMola(this.suspensao.altura, alvo, k, c, dt, -limiteSup, limiteSup);
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
                this.suspensao.altura.v -= forca * SUSP.impulsoPulo;
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
                this.suspensao.altura.v += impacto * SUSP.impulsoPouso;
                p.pousouNoFrame = true;
            }
        }
        this.reagirAoRelevoVertical(vyChao, soloConhecido, dt, g);
        this.atualizarAltura(dt);
    }

    /**
     * Reação do chassi ao relevo, parte vertical (só visual: mexe na mola da carroceria, não na posição do carro).
     * Modelo de "um quarto de carro": a carroceria é uma massa na mola e o solo é a base que se move. Quando o solo
     * acelera para cima (fundo de vale, início de subida) a carroceria fica para trás e comprime; quando acelera
     * para baixo (crista) ela alivia e sobe. A aceleração vem da velocidade vertical do solo, já suavizada.
     */
    private reagirAoRelevoVertical(vyChao: number, soloConhecido: boolean, dt: number, g: number) {
        const s = this.suspensao, p = this.pulo;
        if (p.noAr || !soloConhecido || p.pousouNoFrame) {
            s.vySoloSuave = soloConhecido ? vyChao : 0;   // sem referência confiável: só acompanha, sem empurrar
            return;
        }
        const antes = s.vySoloSuave;
        s.vySoloSuave = mix(antes, vyChao, lerpFactorDt(SUSP.suavRelevoVertical, dt * 60));

        const ganho = SUSP.ganhoRelevoVertical;
        const limite = 3 * Math.max(g, 50);               // evita picos nos "joelhos" entre triângulos do terreno
        const aSolo = clamp((s.vySoloSuave - antes) / dt, -limite, limite);
        s.altura.v += aSolo * ganho * dt;
    }

    /**
     * Reação do chassi ao relevo, parte angular (pitch/roll). O chassi "fica para trás" quando a inclinação do
     * terreno muda: recebe um deslocamento contrário à mudança e a mola do chassi o traz de volta (com um pequeno
     * balanço). A referência é a inclinação do terreno suavizada, que só segue o relevo; por isso a transição
     * ar -> chão não conta (ela já é tratada pelo impulso de aterrissagem).
     */
    private reagirAoRelevoAngular(pitchAlvo: number, rollAlvo: number, dt60: number, primeiroFrame: boolean) {
        const s = this.suspensao;
        const pAnt = s.soloPitchSuave, rAnt = s.soloRollSuave;
        if (primeiroFrame) { s.soloPitchSuave = pitchAlvo; s.soloRollSuave = rollAlvo; return; }

        const fator = lerpFactorDt(SUSP.suavRelevoAngular, dt60);
        s.soloPitchSuave = mix(pAnt, pitchAlvo, fator);
        s.soloRollSuave = mix(rAnt, rollAlvo, fator);

        const ganho = SUSP.ganhoRelevoAngular, lim = this.limitesAngulo();
        s.pitch.x = clamp(s.pitch.x - (s.soloPitchSuave - pAnt) * ganho, -lim.pitch, lim.pitch);
        s.roll.x = clamp(s.roll.x - (s.soloRollSuave - rAnt) * ganho, -lim.roll, lim.roll);
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
            f.forwardSpeed *= Math.pow(clamp(fis.atritoEscalar, 0, 1), dt60);
            const fatorArrasto = clamp(fis.atritoLinear * dt60, 0, 1);
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

        const su = this.config.carro.suspensao, dim = this.config.carro.dimensoes;
        const { k, c } = this.molaSuspensao();

        // aceleração do carro (unidades/s²), limitada ao que o pneu consegue transmitir: as curvas do jogo são arcade
        // (chegam a vários g) e um carro de verdade não passa de ~1g
        const aMax = SUSP.aderenciaPneu * Math.max(0, fis.gravidade);
        const aLong = clamp(-dot(globalAccel, forward) * 3600, -aMax, aMax);   // dt60 -> por segundo: x 60²
        const aLat = clamp(dot(globalAccel, right) * 3600, -aMax, aMax);

        // transferência de peso: a carroceria inclina até as molas segurarem o momento m·a·h. Com as molas da
        // frequência dada (k = m/4 · ω² em cada roda), o ângulo de equilíbrio é atan(4·a·h / (ω²·L²)): a massa se
        // cancela. L = entre-eixos (frear/acelerar) ou distância entre rodas dividida pela barra (curva)
        const h = Math.max(0, su.alturaCentroMassa);
        const L = Math.max(0.1, dim.comprimentorodas), T = Math.max(0.1, dim.largurarodas);
        const ty = degrees(Math.atan(4 * aLong * h / (k * L * L)));
        const tx = degrees(Math.atan(4 * aLat * h / (Math.max(0.01, su.barraEstabilizadora) * k * T * T)));

        const lim = this.limitesAngulo();
        integrarMola(s.pitch, ty, k, c, dt, -lim.pitch, lim.pitch);
        integrarMola(s.roll, tx, k, c, dt, -lim.roll, lim.roll);
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
            const primeiroFrameSolo = !this.pulo.soloValido;   // início ou depois de reposicionar o carro
            this.atualizarVertical(alturaMediaSolo + r.radius, dt);

            const deltaZ = Math.max(0.001, dim.comprimentorodas);
            const deltaX = Math.max(0.001, dim.largura);

            const pitchAlvo = -degrees(Math.atan2(((hFE + hFD) * 0.5) - ((hTE + hTD) * 0.5), deltaZ));
            const rollAlvo = degrees(Math.atan2(((hFD + hTD) * 0.5) - ((hFE + hTE) * 0.5), deltaX));

            if (this.pulo.pousouNoFrame) {
                const lim = this.limitesAngulo(), tranco = SUSP.trancoPousoAngular;
                s.pitch.x = clamp(s.pitch.x + (s.terrenoPitchAngle - pitchAlvo) * tranco, -lim.pitch, lim.pitch);
                s.roll.x = clamp(s.roll.x + (s.terrenoRollAngle - rollAlvo) * tranco, -lim.roll, lim.roll);
            }

            if (!this.pulo.noAr) {
                const fator = lerpFactorDt(SUSP.suavTerreno, dt60);
                s.terrenoPitchAngle = mix(s.terrenoPitchAngle, pitchAlvo, fator);
                s.terrenoRollAngle = mix(s.terrenoRollAngle, rollAlvo, fator);
                this.reagirAoRelevoAngular(pitchAlvo, rollAlvo, dt60, primeiroFrameSolo);
            } else {
                s.soloPitchSuave = pitchAlvo; s.soloRollSuave = rollAlvo;
                const velHorizontal = len(f.velocity) * 60;
                const fatorAtitude = clamp(velHorizontal / 150, 0, 1);
                const pitchAr = clamp(-degrees(Math.atan2(f.velocityY, Math.max(velHorizontal, 1))), -25, 25) * fatorAtitude;
                const fator = lerpFactorDt(SUSP.suavAtitudeAr, dt60);
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
        const offZ = this.config.carro.dimensoes.offsetchassi ?? 0;
        let m = this.modelMatrix.translate(v3(0, -this.deslocamentoCarroceria(), offZ));
        m = m.rotate(radians(this.suspensao.pitch.x), X_AXIS);
        m = m.rotate(radians(this.suspensao.roll.x), Z_AXIS);
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