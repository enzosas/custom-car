import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { Terreno } from './Terreno';
import { Estrada } from './Estrada';
import { Floresta } from './Floresta';
import { Grama, gerarGeometriaTufo } from './Grama';
import { gerarGeometriasArvore } from './Arvore';
import { sementeAleatoria } from '@/core/Random';
import { geometriaDe } from '@/graphics/Malha';

const COR_GRAMA = [0.34, 0.7, 0.56];

export class WorldBuilder {
    public terreno = new Terreno();
    public estrada = new Estrada();
    public floresta = new Floresta();
    public grama = new Grama();

    public terrenoMesh!: THREE.Mesh;
    public estradaMesh: THREE.Mesh | null = null;
    public gramaMesh!: THREE.InstancedMesh;

    public florestaMeshes: THREE.InstancedMesh[][] = [[], [], [], []];
    public florestaLotes: Float32Array[] = [];
    private florestaAttrs: THREE.InstancedBufferAttribute[] = [];
    private florestaCap = 0;

    private gramaAttr!: THREE.InstancedBufferAttribute;
    public gramaLote = new Float32Array(0);
    private gramaCap = 0;

    private terrenoPos!: THREE.BufferAttribute;
    public seedPista = 0;

    /** `matOpaco` é compartilhado com o Jogo (quem o cria também o descarta). */
    constructor(private matOpaco: THREE.ShaderMaterial, private config = GAME_CONFIG) {}

    // 1. Carregar Terreno Base
    async carregarTerreno(urlTerreno: string): Promise<boolean> {
        const resp = await fetch(urlTerreno);
        if (!resp.ok) {
            console.error(`${urlTerreno} não encontrado.`);
            return false;
        }
        const buffer = await resp.arrayBuffer();
        this.terreno.carregarRaw(buffer);

        this.inicializarMalhasBase();
        return true;
    }

    private inicializarMalhasBase() {
        // Terreno
        const pos = this.terreno.gerarPosicoes();
        const cores = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
            cores[i] = COR_GRAMA[0];
            cores[i + 1] = COR_GRAMA[1];
            cores[i + 2] = COR_GRAMA[2];
        }

        const gt = new THREE.BufferGeometry();
        this.terrenoPos = new THREE.BufferAttribute(pos, 3);
        this.terrenoPos.setUsage(THREE.DynamicDrawUsage);
        gt.setAttribute('position', this.terrenoPos);
        gt.setAttribute('color', new THREE.BufferAttribute(cores, 3));
        gt.setIndex(new THREE.BufferAttribute(this.terreno.gerarIndices(), 1));

        this.terrenoMesh = new THREE.Mesh(gt, this.matOpaco);
        this.terrenoMesh.frustumCulled = false;

        // Grama
        this.gramaMesh = new THREE.InstancedMesh(geometriaDe(gerarGeometriaTufo(this.config)), this.matOpaco, 1);
        this.gramaMesh.frustumCulled = false;
        this.gramaMesh.count = 0;

        // Floresta
        this.construirFlorestaGeometrias();
    }

    // 2. Geração de Pista e Relevo
    regenerarPista(novaSeed: boolean): boolean {
        if (novaSeed || this.seedPista === 0) this.seedPista = sementeAleatoria();

        const malha = this.estrada.gerar(this.terreno, this.seedPista);

        // Atualiza Terreno
        (this.terrenoPos.array as Float32Array).set(this.terreno.gerarPosicoes());
        this.terrenoPos.needsUpdate = true;

        // Atualiza Estrada
        if (this.estradaMesh) {
            this.estradaMesh.geometry.dispose();
        }

        if (malha) {
            if (!this.estradaMesh) {
                this.estradaMesh = new THREE.Mesh(geometriaDe(malha), this.matOpaco);
                this.estradaMesh.frustumCulled = false;
            } else {
                this.estradaMesh.geometry = geometriaDe(malha);
            }
        }
        return true;
    }

    // 3. Geração de Vegetação
    regerarVegetacao() {
        this.floresta.gerarArvores(this.terreno, this.estrada);
        this.grama.gerarGrama(this.terreno, this.estrada);
        this.garantirCapacidadeFloresta(Math.max(1, this.floresta.quantidade));
        this.garantirCapacidadeGrama(Math.max(1, this.grama.quantidade));
    }

    // --- Helpers de Geometria e Instancing ---

    construirFlorestaGeometrias() {
        const g = gerarGeometriasArvore(this.config);
        const grupos = [g.lod0, g.lod1, g.lod2, g.lod3];
        grupos.forEach((malhas, k) => {
            malhas.forEach((m, j) => {
                const geo = geometriaDe(m);
                let mesh = this.florestaMeshes[k][j];
                if (!mesh) {
                    mesh = new THREE.InstancedMesh(geo, this.matOpaco, 1);
                    mesh.frustumCulled = false;
                    mesh.count = 0;
                    this.florestaMeshes[k][j] = mesh;
                } else {
                    mesh.geometry.dispose();
                    mesh.geometry = geo;
                }
            });
        });
        this.garantirCapacidadeFloresta(Math.max(1, this.config.arvore.arvores.quantidade));
    }

    private garantirCapacidadeFloresta(qtd: number) {
        if (qtd <= this.florestaCap && this.florestaAttrs.length === 4) return;
        this.florestaCap = Math.max(qtd, this.florestaCap);
        this.florestaLotes = []; this.florestaAttrs = [];
        for (let k = 0; k < 4; ++k) {
            const arr = new Float32Array(this.florestaCap * 16);
            const attr = new THREE.InstancedBufferAttribute(arr, 16);
            attr.setUsage(THREE.DynamicDrawUsage);
            this.florestaLotes.push(arr); this.florestaAttrs.push(attr);
            for (const mesh of this.florestaMeshes[k]) mesh.instanceMatrix = attr;
        }
    }

    garantirCapacidadeGrama(qtd: number) {
        if (qtd <= this.gramaCap && this.gramaAttr) return;
        this.gramaCap = Math.max(qtd, this.gramaCap, 1);
        this.gramaLote = new Float32Array(this.gramaCap * 16);
        this.gramaAttr = new THREE.InstancedBufferAttribute(this.gramaLote, 16);
        this.gramaAttr.setUsage(THREE.DynamicDrawUsage);
        this.gramaMesh.instanceMatrix = this.gramaAttr;
    }

    atualizarGrama() {
        if (this.gramaAttr) this.gramaAttr.needsUpdate = true;
    }

    atualizarFlorestaLods(ref: { x: number; y: number; z: number }, sombraPass: boolean) {
        const cont = this.floresta.selecionar(ref, sombraPass, this.florestaLotes);
        for (let k = 0; k < 4; ++k) {
            this.florestaAttrs[k].needsUpdate = true;
            for (const mesh of this.florestaMeshes[k]) {
                mesh.count = cont[k];
                mesh.visible = cont[k] > 0;
            }
        }
    }

    alturaSuperficie = (x: number, z: number): number => {
        let h = this.estrada.obterAlturaSuperficie(x, z, this.terreno);
        if (!this.estrada.estaNoAsfalto(x, z)) h -= this.config.terreno.superficie.offsetprofundidadegrama;
        return h;
    };

}