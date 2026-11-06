// ControleJogador.ts - traduz teclado, toque e piloto automático nos comandos do carro.
import { GAME_CONFIG } from './config';
import { Entrada } from './Input';
import type { ControlesToque } from './ControlesToque';
import type { Veiculo } from '@/entities/Veiculo';
import { PilotoAutomatico } from '@/entities/PilotoAutomatico';
import type { Estrada } from '@/world/Estrada';

export interface Comandos {
    throttle: number;       // -1 (ré/freio) .. 1 (acelera)
    steer: number;          // -1 (direita) .. 1 (esquerda)
    handbrake: boolean;
    carregandoPulo: boolean;
}

/** easter egg: apertar o freio de mão N vezes em T segundos troca o carro */
const TROCA_CARRO_APERTOS = 10;
const TROCA_CARRO_JANELA_S = 5.0;

export class ControleJogador {
    private readonly pilotoAuto = new PilotoAutomatico();

    private pulandoAnterior = false;
    private carregandoPulo = false;
    private freioMaoAnterior = false;
    private historicoFreioMao: number[] = [];

    constructor(private readonly toque: ControlesToque, private readonly config = GAME_CONFIG) {}

    private get freioMao() { return Entrada.tecla('Space') || this.toque.drift; }

    /** deve ser chamado uma vez por frame; devolve true quando o easter egg do freio de mão completou */
    detectarTrocaDeCarro(): boolean {
        const ativo = this.freioMao;
        let trocar = false;
        if (ativo && !this.freioMaoAnterior) {
            const agora = performance.now() / 1000;
            this.historicoFreioMao.push(agora);
            this.historicoFreioMao = this.historicoFreioMao.filter((t) => agora - t <= TROCA_CARRO_JANELA_S);
            if (this.historicoFreioMao.length >= TROCA_CARRO_APERTOS) {
                this.historicoFreioMao = [];
                trocar = true;
            }
        }
        this.freioMaoAnterior = ativo;
        return trocar;
    }

    /** lê os comandos do frame (piloto automático ou jogador) */
    ler(veiculo: Veiculo, estrada: Estrada, mouseSobreUI: boolean): Comandos {
        let throttle = 0, steer = 0;
        let handbrake = this.freioMao;

        if (this.config.pilotoAutomaticoOn) {
            const cmd = this.pilotoAuto.atualizar(veiculo, estrada);
            throttle = cmd.throttle; steer = cmd.steer; handbrake = cmd.handbrake;
        } else {
            if (Entrada.tecla('KeyW') || this.toque.forward) throttle += 1;
            if (Entrada.tecla('KeyS') || this.toque.backward) throttle -= 1;
            if (Entrada.tecla('KeyA') || this.toque.left) steer += 1;
            if (Entrada.tecla('KeyD') || this.toque.right) steer -= 1;
        }

        const pulando = Entrada.tecla('ShiftLeft') || Entrada.tecla('ShiftRight') || this.toque.jump;
        if (pulando && !this.pulandoAnterior && !mouseSobreUI) this.carregandoPulo = true;
        if (!pulando) this.carregandoPulo = false;
        this.pulandoAnterior = pulando;

        return { throttle, steer, handbrake, carregandoPulo: this.carregandoPulo };
    }
}
