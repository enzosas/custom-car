// EfeitosDrift.ts - efeitos visuais gerados pelo carro: marcas de pneu, fuma a de drift e peda os de grama.
import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { randGlobal } from '@/core/Random';
import type { Veiculo } from './Veiculo';
import { RastroPneu } from '@/graphics/RastroPneu';
import { SistemaParticulas } from '@/graphics/Particulas';
import {
    type UniformsCompartilhados,
    criarMaterialRastro,
    criarMaterialParticula,
} from '@/graphics/materialPrincipal';

type Buffers = { pos: Float32Array; cor: Float32Array };

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

    constructor(
        scene: THREE.Scene,
        uniforms: UniformsCompartilhados,
        private readonly veiculo: Veiculo,
        /** diz se o ponto (x,z) est  sobre o asfalto: fuma  no asfalto, grama s  fora dele */
        private readonly estaNoAsfalto: (x: number, z: number) => boolean,
        config = GAME_CONFIG,
    ) {
        this.rastroPneus = new RastroPneu(config.carro.rodas.largura, 8.0);
        this.matRastro = criarMaterialRastro(uniforms);
        // Agora passamos os uniforms para o material das partículas
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

    /** esconde/mostra tudo (usado no passe de sombra, que n o deve desenhar efeitos) */
    setVisivel(visivel: boolean) {
        this.rastroMesh.visible = visivel;
        this.particulasMesh.visible = visivel;
    }

    /** simula o: atualiza o que j  existe e emite novos pontos de rastro / part culas */
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

        this.particulas.update(dt);

        if (v.estaDerrapando()) {
            const intensidade = v.getIntensidadeDrift();
            for (let roda = 2; roda < 4; ++roda) {
                const pos = v.getPosContatoRoda(roda);
                if (this.estaNoAsfalto(pos.x, pos.z)) {
                    const qtd = Math.max(1, Math.trunc(intensidade * 8));
                    this.particulas.emitirFumaca(pos, v.getVelocidadeVetor(), dt, qtd);
                }
            }
        }

        const vel = v.getVelocidade();
        if (vel > 3.0 && !v.estaNoAr()) {
            const chance = Math.trunc(((vel - 3.0) / 4.0) * 5.0 + 0.1);
            for (let roda = 0; roda < 4; ++roda) {
                const pos = v.getPosContatoRoda(roda);
                if (!this.estaNoAsfalto(pos.x, pos.z) && (randGlobal.next() % 100) < chance) {
                    this.particulas.emitirGrama(pos, v.getVelocidadeVetor(), 1);
                }
            }
        }
    }

    /** copia o estado atual para as malhas (camRight/camUp orientam as part culas, que s o billboards) */
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