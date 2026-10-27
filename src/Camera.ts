// Camera.ts — port de Camera.h (câmera orbital de perseguição com amortecimento).
// Só a lógica; o Jogo.ts aplica posição/alvo na câmera do three.

import { GAME_CONFIG } from './config';
import { type V3, clamp, mix, radians } from './Mat4';

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
    }

    update(deltaTime: number, mouse: EntradaMouse, targetPos: V3, targetYaw: number, alturaTeto: number,
           _throttle: number, velocidadeCarro: number, mouseSobreUI = false,
           alturaFn?: (x: number, z: number) => number) {
        const dt = clamp(deltaTime, 0, 0.1);
        const dt60 = dt * 60;

        this.sincronizar();
        const sensibilidade = this.config.camera.parametros.sensibilidadeMouse;

        if (mouse.direito && !mouseSobreUI) {
            if (!this.estavaArrastando) {
                this.mouseAnteriorX = mouse.x; this.mouseAnteriorY = mouse.y;
                this.estavaArrastando = true;
            }
            const deltaX = mouse.x - this.mouseAnteriorX;
            const deltaY = mouse.y - this.mouseAnteriorY;
            this.mouseAnteriorX = mouse.x; this.mouseAnteriorY = mouse.y;
            this.anguloCameraYaw -= deltaX * (sensibilidade * 0.0174532925);
            this.anguloCameraPitch += deltaY * sensibilidade;
            this.anguloCameraPitch = clamp(this.anguloCameraPitch, -20, 80);
        } else {
            this.estavaArrastando = false;
            const velocidadeMinimaAlinhamento = 0.35;
            if (Math.abs(velocidadeCarro) > velocidadeMinimaAlinhamento) {
                const taxaDt = 1 - Math.pow(1 - clamp(this.taxaRetornoOrbita, 0, 0.9999), dt60);
                let diffYaw = targetYaw - this.anguloCameraYaw;
                while (diffYaw < -3.14159265) diffYaw += 6.28318530;
                while (diffYaw > 3.14159265) diffYaw -= 6.28318530;
                this.anguloCameraYaw += diffYaw * taxaDt;
            }
        }

        const ancora: V3 = { x: targetPos.x, y: targetPos.y + alturaTeto, z: targetPos.z };
        const raio = this.distanciaRaioBase * this.fatorZoom;
        const radPitch = radians(this.anguloCameraPitch);
        const cosP = Math.cos(radPitch), sinP = Math.sin(radPitch);

        const posAlvo: V3 = {
            x: ancora.x + (-raio * cosP * Math.sin(this.anguloCameraYaw)),
            y: ancora.y + raio * sinP,
            z: ancora.z + (-raio * cosP * Math.cos(this.anguloCameraYaw)),
        };

        const fatorPos = 1 - Math.pow(1 - clamp(this.suavizacaoPos, 0, 0.9999), dt60);
        const fatorTarget = 1 - Math.pow(1 - clamp(this.suavizacaoTarget, 0, 0.9999), dt60);

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

    /** vetor "up" de referência do lookAt (evita singularidade na vertical) */
    getUpRef(): V3 {
        const dx = this.cameraTarget.x - this.cameraPos.x, dy = this.cameraTarget.y - this.cameraPos.y, dz = this.cameraTarget.z - this.cameraPos.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        return Math.abs(dy / l) > 0.99 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
    }

    getPosition() { return this.cameraPos; }
}
