// Camera.ts   port de Camera.h (c mera orbital de persegui o com amortecimento).
// S  a l gica; o Jogo.ts aplica posi o/alvo na c mera do three.

import { GAME_CONFIG } from '@/core/config';
import { type V3, clamp, mix, radians, degrees, normalizarAngulo, lerpFactorDt } from '@/graphics/Mat4';

export interface EntradaMouse { x: number; y: number; direito: boolean; esquerdo: boolean }

export class CameraJogo {
    cameraPos: V3 = { x: 0, y: 20, z: -80 };
    cameraTarget: V3 = { x: 0, y: 0, z: 0 };

    private distanciaRaioBase = 80;
    private fatorZoom = 1;
    private suavizacaoPos = 0.12;
    private suavizacaoTarget = 1.0;
    private anguloCameraYaw = 0;
    private anguloCameraPitch = 15;
    private pitchPadrao = 15;
    private taxaRetornoOrbita = 0.06;
    private autoCentrarVerticalmente = true;
    /** inclinação do terreno (graus, + = subida) seguida pela câmera; é subtraída do pitch relativo escolhido no mouse */
    private inclinacaoSuave = 0;
    private inclinacaoInicializada = false;

    private mouseAnteriorX = 0;
    private mouseAnteriorY = 0;
    private estavaArrastando = false;

    constructor(private config = GAME_CONFIG) {
        this.sincronizar();
        this.anguloCameraPitch = this.pitchPadrao;
    }

    private sincronizar() {
        const c = this.config.camera.parametros;
        this.distanciaRaioBase = c.distanciaRaioBase;
        this.pitchPadrao = c.pitchPadrao;
        this.suavizacaoPos = c.suavizacaoPos;
        this.suavizacaoTarget = c.suavizacaoTarget;
        this.taxaRetornoOrbita = c.taxaRetornoOrbita;
        this.autoCentrarVerticalmente = c.autoCentrarVerticalmente ?? true;
    }

    /**
     * inclinação do terreno sob o carro em graus (+ = subida). A malha é de triângulos planos (~150 unidades), então
     * uma base curta (a distância entre eixos) daria um degrau a cada triângulo cruzado; por isso a base cobre
     * ~2 células da malha: a janela desliza pela superfície contínua e a inclinação varia sem saltos.
     */
    private inclinacaoTerreno(pos: V3, yaw: number, alturaFn?: (x: number, z: number) => number): number {
        if (!alturaFn) return 0;
        const celula = this.config.terreno.parametros.espacamento * 0.005;
        const base = Math.max(0.001, this.config.carro.dimensoes.comprimentorodas, celula * 2);
        const fx = Math.sin(yaw) * base * 0.5, fz = Math.cos(yaw) * base * 0.5;
        const dh = alturaFn(pos.x + fx, pos.z + fz) - alturaFn(pos.x - fx, pos.z - fz);
        return degrees(Math.atan2(dh, base));
    }

    update(deltaTime: number, mouse: EntradaMouse, targetPos: V3, targetYaw: number, alturaTeto: number,
        _throttle: number, velocidadeCarro: number, mouseSobreUI = false,
        alturaFn?: (x: number, z: number) => number) {
        const dt = clamp(deltaTime, 0, 0.1);
        const dt60 = dt * 60;

        this.sincronizar();

        const sensibilidade = this.config.camera.parametros.sensibilidadeMouse;

        const arrastando = mouse.direito && !mouseSobreUI;
        if (arrastando) {
            if (!this.estavaArrastando) {
                this.mouseAnteriorX = mouse.x; this.mouseAnteriorY = mouse.y;
                this.estavaArrastando = true;
            }
            const deltaX = mouse.x - this.mouseAnteriorX;
            const deltaY = mouse.y - this.mouseAnteriorY;
            this.mouseAnteriorX = mouse.x; this.mouseAnteriorY = mouse.y;

            this.anguloCameraYaw -= deltaX * (radians(sensibilidade));
            this.anguloCameraPitch += deltaY * sensibilidade;
            this.anguloCameraPitch = clamp(this.anguloCameraPitch, -20, 80);
        } else {
            this.estavaArrastando = false;
            const velocidadeMinimaAlinhamento = 0.35;
            if (Math.abs(velocidadeCarro) > velocidadeMinimaAlinhamento) {
                const diffYaw = normalizarAngulo(targetYaw - this.anguloCameraYaw);
                this.anguloCameraYaw += diffYaw * lerpFactorDt(this.taxaRetornoOrbita, dt60);
            }
        }

        // auto-centrar: a inclinação do terreno segue na mesma velocidade do retorno da órbita (desligado = alvo 0, decai suave);
        // segurando o botão direito o pitch fica parado (a inclinação seguida congela) e ao soltar a câmera volta a acompanhar o terreno
        const inclinacaoAlvo = this.autoCentrarVerticalmente ? this.inclinacaoTerreno(targetPos, targetYaw, alturaFn) : 0;
        if (!this.inclinacaoInicializada) { this.inclinacaoSuave = inclinacaoAlvo; this.inclinacaoInicializada = true; }
        else if (!arrastando) this.inclinacaoSuave = mix(this.inclinacaoSuave, inclinacaoAlvo, lerpFactorDt(this.taxaRetornoOrbita, dt60));

        const pConf = this.config.camera.parametros;
        const offX = pConf.offsetX ?? 0;
        const offY = pConf.offsetY ?? 0;
        const offZ = pConf.offsetZ ?? 0;

        // Cálculos do offset para ele ser relativo à direção em que o carro está apontando
        const cY = Math.cos(targetYaw);
        const sY = Math.sin(targetYaw);

        // Local X (lados), Local Y (altura), Local Z (frente/trás)
        const globalOffX = offX * cY + offZ * sY;
        const globalOffY = offY;
        const globalOffZ = offX * (-sY) + offZ * cY;

        const ancora: V3 = {
            x: targetPos.x + globalOffX,
            y: targetPos.y + alturaTeto + globalOffY,
            z: targetPos.z + globalOffZ
        };

        const raio = this.distanciaRaioBase * this.fatorZoom;
        // subida = traseira do carro aponta para baixo, então a câmera desce no mundo para manter o mesmo ângulo em relação ao carro
        const pitchEfetivo = clamp(this.anguloCameraPitch - this.inclinacaoSuave, -20, 85);
        const radPitch = radians(pitchEfetivo);
        // offset de yaw: só desloca a posição em órbita; o "retorno" da órbita continua usando o yaw sem o offset
        const yawOrbita = this.anguloCameraYaw + radians(pConf.offsetYaw ?? 0);
        const cosP = Math.cos(radPitch), sinP = Math.sin(radPitch);

        const posAlvo: V3 = {
            x: ancora.x + (-raio * cosP * Math.sin(yawOrbita)),
            y: ancora.y + raio * sinP,
            z: ancora.z + (-raio * cosP * Math.cos(yawOrbita)),
        };

        const fatorPos = lerpFactorDt(this.suavizacaoPos, dt60);
        const fatorTarget = lerpFactorDt(this.suavizacaoTarget, dt60);

        this.cameraPos = { x: mix(this.cameraPos.x, posAlvo.x, fatorPos), y: mix(this.cameraPos.y, posAlvo.y, fatorPos), z: mix(this.cameraPos.z, posAlvo.z, fatorPos) };
        this.cameraTarget = { x: mix(this.cameraTarget.x, ancora.x, fatorTarget), y: mix(this.cameraTarget.y, ancora.y, fatorTarget), z: mix(this.cameraTarget.z, ancora.z, fatorTarget) };

        if (alturaFn) {
            const alturaSolo = alturaFn(this.cameraPos.x, this.cameraPos.z);
            const margemSeguranca = 4;
            if (this.cameraPos.y < alturaSolo + margemSeguranca) this.cameraPos.y = alturaSolo + margemSeguranca;
        }
    }

    processarScroll(yOffset: number) {
        this.fatorZoom -= yOffset * 0.1;
        this.fatorZoom = clamp(this.fatorZoom, 0.1, 400);
    }

    /** vetor "up" de refer ncia do lookAt (evita singularidade na vertical) */
    getUpRef(): V3 {
        const dx = this.cameraTarget.x - this.cameraPos.x, dy = this.cameraTarget.y - this.cameraPos.y, dz = this.cameraTarget.z - this.cameraPos.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        const up: V3 = Math.abs(dy / l) > 0.99 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };

        // offset de roll: gira o "up" em volta da direção do olhar (fórmula de Rodrigues; up é perpendicular a k
        // quando a câmera não olha na vertical, e quase perpendicular nos demais casos, o que basta para o lookAt)
        const roll = radians(this.config.camera.parametros.offsetRoll ?? 0);
        if (roll === 0) return up;
        const kx = dx / l, ky = dy / l, kz = dz / l;
        const c = Math.cos(roll), s = Math.sin(roll);
        const dot = kx * up.x + ky * up.y + kz * up.z;
        const cx = ky * up.z - kz * up.y, cy = kz * up.x - kx * up.z, cz = kx * up.y - ky * up.x;
        return {
            x: up.x * c + cx * s + kx * dot * (1 - c),
            y: up.y * c + cy * s + ky * dot * (1 - c),
            z: up.z * c + cz * s + kz * dot * (1 - c),
        };
    }

    getPosition() { return this.cameraPos; }
}