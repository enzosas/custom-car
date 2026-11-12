// EfeitosDrift.ts - efeitos visuais gerados pelo carro: marcas de pneu e partículas (fumaça, grama, folhas, areia, neve, poeira).
import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { randGlobal } from '@/core/Random';
import type { Veiculo } from './Veiculo';
import { RastroPneu } from '@/graphics/RastroPneu';
import { SistemaParticulas, TipoNuvem } from '@/graphics/Particulas';
import {
    type UniformsCompartilhados,
    criarMaterialRastro,
    criarMaterialParticula,
} from '@/graphics/materialPrincipal';
import type { SaidaPaleta } from '@/world/Paleta';

type Buffers = { pos: Float32Array; cor: Float32Array };

/** as emissões foram afinadas a 60 fps (valores "por frame"); aqui viram "por segundo" para não dependerem do framerate */
const TAXA_FRAME = 60;
/** a superfície sob a roda (bioma, altitude) muda devagar: relê no máximo a cada tanto de segundos */
const INTERVALO_SUPERFICIE = 0.15;
/** rodando fora do asfalto: velocidade mínima para levantar areia, neve e poeira (a da grama é 3, ver chanceRolando) */
const VEL_MIN_NUVEM = 1.0;
/** nuvens por segundo, por roda, a plena superfície de areia/neve: de VEL_MIN_NUVEM até a velocidade máxima do carro */
const TAXA_NUVEM_MIN = 8, TAXA_NUVEM_MAX = 30;
/** o mesmo para a poeira da rocha: poucas */
const TAXA_POEIRA_MIN = 1.5, TAXA_POEIRA_MAX = 5;
/** opacidade das nuvens de areia/neve levantadas só por rodar (no drift é 1) */
const FORCA_NUVEM_ROLANDO = 0.85;

// tipos de emissão "rodando fora do asfalto": índice em devidoRolando[roda]
const K_AREIA = 0, K_NEVE = 1, K_POEIRA = 2, K_GRAMA = 3, K_FOLHA = 4, N_TIPOS = 5;

const COR_NEVE = { x: 0.97, y: 0.98, z: 1.0 };

const novaSuperficie = (): SaidaPaleta => ({ r: 0, g: 0, b: 0, arvore: 1, grama: 1, neve: 0, rocha: 0, deserto: 0, outono: 0 });

export class EfeitosDrift {
    private readonly rastroPneus: RastroPneu;
    private readonly particulas = new SistemaParticulas();

    private readonly matRastro: THREE.ShaderMaterial;
    private readonly matParticula: THREE.ShaderMaterial;

    private readonly rastroMesh: THREE.Mesh;
    private readonly particulasMesh: THREE.Mesh;

    private readonly rastroBuf: Buffers = { pos: new Float32Array(0), cor: new Float32Array(0) };
    private readonly particulasBuf: Buffers = { pos: new Float32Array(0), cor: new Float32Array(0) };

    private estavaDerrapandoAnterior = false;

    // por roda: partículas "devidas" (fração que sobra de um frame para o outro) e a última superfície lida
    private readonly devidoDrift = [0, 0, 0, 0];
    private readonly devidoRolando = [0, 1, 2, 3].map(() => new Float64Array(N_TIPOS));
    private readonly superficies = [novaSuperficie(), novaSuperficie(), novaSuperficie(), novaSuperficie()];
    private readonly tempoSuperficie = [0, 0, 0, 0];
    private readonly corTmp = { x: 0, y: 0, z: 0 };

    constructor(
        scene: THREE.Scene,
        uniforms: UniformsCompartilhados,
        private readonly veiculo: Veiculo,
        /** diz se o ponto (x,z) está sobre o asfalto */
        private readonly estaNoAsfalto: (x: number, z: number) => boolean,
        /** preenche a cor e os pesos de superfície (neve, rocha, deserto, outono) do terreno em (x,z) */
        private readonly superficieEm: (x: number, z: number, saida: SaidaPaleta) => void,
        private readonly config = GAME_CONFIG,
    ) {
        this.rastroPneus = new RastroPneu(config.carro.rodas.largura, 8.0);
        this.matRastro = criarMaterialRastro(uniforms);
        this.matParticula = criarMaterialParticula(uniforms);

        this.rastroMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.matRastro);
        this.rastroMesh.frustumCulled = false;
        scene.add(this.rastroMesh);

        this.particulasMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.matParticula);
        this.particulasMesh.frustumCulled = false;
        scene.add(this.particulasMesh);
    }

    setLarguraRastro(largura: number) { this.rastroPneus.setLargura(largura); }

    setWireframe(ativo: boolean) { this.matRastro.wireframe = ativo; }

    /** esconde/mostra tudo (usado no passe de sombra, que não deve desenhar efeitos) */
    setVisivel(visivel: boolean) {
        this.rastroMesh.visible = visivel;
        this.particulasMesh.visible = visivel;
    }

    /** superfície sob a roda, relida só de tempos em tempos */
    private superficie(roda: number, x: number, z: number): SaidaPaleta {
        if (this.tempoSuperficie[roda] <= 0) {
            this.superficieEm(x, z, this.superficies[roda]);
            this.tempoSuperficie[roda] = INTERVALO_SUPERFICIE;
        }
        return this.superficies[roda];
    }

    /** simulação: atualiza o que já existe e emite novos pontos de rastro / partículas */
    atualizar(dt: number) {
        const v = this.veiculo;
        this.rastroPneus.update(dt);

        if (v.estaDerrapando()) {
            const intensidade = v.getIntensidadeDrift();
            for (let roda = 2; roda < 4; ++roda) {  // rodas traseiras: fitas 0 e 1
                this.rastroPneus.adicionarPontoRoda(roda - 2, v.getPosContatoRoda(roda), v.getEixoLateralRoda(roda), intensidade, this.estavaDerrapandoAnterior);
            }
            this.estavaDerrapandoAnterior = true;
        } else {
            this.estavaDerrapandoAnterior = false;
        }

        // interruptor do painel (terreno > superficie): desligado, nenhuma partícula existe nem é emitida
        if (!this.config.terreno.superficie.particulas) {
            this.particulas.limpar();
            return;
        }

        this.particulas.update(dt);

        const derrapando = v.estaDerrapando();
        const intensidade = derrapando ? v.getIntensidadeDrift() : 0;
        const vel = v.getVelocidade();
        const velVec = v.getVelocidadeVetor();
        const noChao = !v.estaNoAr();
        // chance (por frame a 60 fps) de uma roda soltar um pedaço de grama ou folha fora do asfalto
        const chanceRolando = vel > 3.0 ? Math.min(1, ((vel - 3.0) / 4.0 * 5.0 + 0.1) / 100) : 0;
        // 0..1: da velocidade mínima das nuvens até a velocidade máxima do carro
        const fracVel = Math.min(1, Math.max(0, (vel - VEL_MIN_NUVEM) / Math.max(0.01, this.config.carro.fisica.velmax - VEL_MIN_NUVEM)));

        for (let roda = 0; roda < 4; ++roda) {
            this.tempoSuperficie[roda] -= dt;
            const pos = v.getPosContatoRoda(roda);
            const noAsfalto = this.estaNoAsfalto(pos.x, pos.z);

            // ---- drift (rodas traseiras): no asfalto, sempre a fumaça padrão; fora dele, areia/neve no deserto e na neve ----
            if (derrapando && roda >= 2) {
                this.devidoDrift[roda] += Math.max(1, Math.trunc(intensidade * 8)) * TAXA_FRAME * dt;
                const n = Math.floor(this.devidoDrift[roda]);
                this.devidoDrift[roda] -= n;
                if (n > 0) {
                    if (noAsfalto) {
                        this.particulas.emitirFumaca(pos, velVec, dt, n);
                    } else {
                        const s = this.superficie(roda, pos.x, pos.z);
                        let nAreia = 0, nNeve = 0;
                        for (let i = 0; i < n; ++i) {
                            const u = randGlobal.randFloat(0, 1);
                            if (u < s.neve) ++nNeve;
                            else if (u < s.neve + s.deserto) ++nAreia;   // nos outros terrenos o drift só levanta o que a roda já levanta (abaixo)
                        }
                        this.corTmp.x = s.r; this.corTmp.y = s.g; this.corTmp.z = s.b;
                        if (nAreia) this.particulas.emitirNuvem(TipoNuvem.AREIA, pos, velVec, dt, nAreia, this.corTmp);
                        if (nNeve) this.particulas.emitirNuvem(TipoNuvem.NEVE, pos, velVec, dt, nNeve, COR_NEVE);
                    }
                }
            } else {
                this.devidoDrift[roda] = 0;
            }

            // ---- rodando fora do asfalto (no terreno em si): o que sai depende da superfície sob a roda ----
            // cada tipo tem a sua taxa, proporcional ao peso dele naquele ponto (nas divisas os tipos se misturam)
            const dev = this.devidoRolando[roda];
            if (noChao && !noAsfalto && vel > VEL_MIN_NUVEM) {
                const s = this.superficie(roda, pos.x, pos.z);
                const taxaNuvem = TAXA_NUVEM_MIN + (TAXA_NUVEM_MAX - TAXA_NUVEM_MIN) * fracVel;
                const taxaPoeira = TAXA_POEIRA_MIN + (TAXA_POEIRA_MAX - TAXA_POEIRA_MIN) * fracVel;
                const pesoGrama = Math.max(0, 1 - s.neve - s.deserto - s.rocha - s.outono);
                const taxaGrama = chanceRolando * TAXA_FRAME;

                dev[K_AREIA] += s.deserto * taxaNuvem * dt;
                dev[K_NEVE] += s.neve * taxaNuvem * dt;
                dev[K_POEIRA] += s.rocha * taxaPoeira * dt;
                dev[K_GRAMA] += pesoGrama * taxaGrama * dt;
                dev[K_FOLHA] += s.outono * taxaGrama * dt;

                this.corTmp.x = s.r; this.corTmp.y = s.g; this.corTmp.z = s.b;
                const nAreia = Math.floor(dev[K_AREIA]); dev[K_AREIA] -= nAreia;
                const nNeve = Math.floor(dev[K_NEVE]); dev[K_NEVE] -= nNeve;
                const nPoeira = Math.floor(dev[K_POEIRA]); dev[K_POEIRA] -= nPoeira;
                const nGrama = Math.floor(dev[K_GRAMA]); dev[K_GRAMA] -= nGrama;
                const nFolha = Math.floor(dev[K_FOLHA]); dev[K_FOLHA] -= nFolha;

                if (nAreia) this.particulas.emitirNuvem(TipoNuvem.AREIA, pos, velVec, dt, nAreia, this.corTmp, FORCA_NUVEM_ROLANDO);
                if (nNeve) this.particulas.emitirNuvem(TipoNuvem.NEVE, pos, velVec, dt, nNeve, COR_NEVE, FORCA_NUVEM_ROLANDO);
                if (nPoeira) this.particulas.emitirNuvem(TipoNuvem.POEIRA, pos, velVec, dt, nPoeira, this.corTmp);   // cor ignorada: poeira é cinza
                if (nGrama) this.particulas.emitirGrama(pos, velVec, nGrama, this.corTmp);
                if (nFolha) this.particulas.emitirFolha(pos, velVec, nFolha, this.corTmp);
            } else {
                dev.fill(0);
            }
        }
    }

    /** copia o estado atual para as malhas (camRight/camUp orientam as partículas, que são billboards) */
    atualizarGeometria(camRight: THREE.Vector3, camUp: THREE.Vector3) {
        const nR = this.rastroPneus.gerarGeometria(this.rastroBuf);
        this.sincronizarBuffer(this.rastroMesh.geometry, 'position', this.rastroBuf.pos, 3);
        this.sincronizarBuffer(this.rastroMesh.geometry, 'color', this.rastroBuf.cor, 3);
        this.rastroMesh.geometry.setDrawRange(0, nR);
        this.rastroMesh.visible = nR > 0;

        const nP = this.particulas.gerarGeometria(
            { x: camRight.x, y: camRight.y, z: camRight.z },
            { x: camUp.x, y: camUp.y, z: camUp.z },
            this.particulasBuf,
        );
        this.sincronizarBuffer(this.particulasMesh.geometry, 'position', this.particulasBuf.pos, 3);
        this.sincronizarBuffer(this.particulasMesh.geometry, 'aCor', this.particulasBuf.cor, 4);
        this.particulasMesh.geometry.setDrawRange(0, nP);
        this.particulasMesh.visible = nP > 0;
    }

    dispose() {
        this.rastroMesh.geometry.dispose();
        this.particulasMesh.geometry.dispose();
        this.matRastro.dispose();
        this.matParticula.dispose();
    }

    private sincronizarBuffer(geo: THREE.BufferGeometry, nome: string, arr: Float32Array, itemSize: number) {
        const atual = geo.getAttribute(nome) as THREE.BufferAttribute | undefined;
        if (!atual || atual.array !== arr) {
            const a = new THREE.BufferAttribute(arr, itemSize);
            a.setUsage(THREE.DynamicDrawUsage);
            geo.setAttribute(nome, a);
        } else {
            atual.needsUpdate = true;
        }
    }
}
