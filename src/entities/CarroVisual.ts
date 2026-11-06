// CarroVisual.ts - parte visual do carro (three.js): chassi, rodas, modelo .glb e suas matrizes.
// A física continua em Veiculo; aqui só se decide COMO o carro aparece na cena.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '@/core/config';
import type { Veiculo } from './Veiculo';
import type { Mat4 } from '@/graphics/Mat4';
import { geometriaDe } from '@/graphics/Malha';

const ROT_RODA_GLB = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
const OFFSET_BASE_MODELO_Y = -3.8;

/** libera geometrias, materiais e texturas de um modelo carregado (o que o GLTFLoader criou) */
function liberarModelo(raiz: THREE.Object3D) {
    raiz.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materiais = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materiais) {
            if (!mat) continue;
            for (const valor of Object.values(mat)) {
                if (valor && (valor as THREE.Texture).isTexture) (valor as THREE.Texture).dispose();
            }
            mat.dispose();
        }
    });
}

/** ajustes para qualquer modelo carregado: sem culling (o chassi não tem bounding box confiável) e textura em sRGB */
function prepararModelo(modelo: THREE.Object3D) {
    modelo.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat?.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    });
}

export class CarroVisual {
    private readonly chassi = new THREE.Group();
    private readonly chassiProcedural: THREE.Mesh;
    private readonly rodasProcedurais: THREE.Mesh[] = [];

    // modo .glb: cada roda do modelo é extraída para um wrapper que segue a física
    private readonly rodasGLBGroup = new THREE.Group();
    private rodasGLB: (THREE.Group | null)[] = [null, null, null, null];
    private raiosOriginaisGLB: number[] = [];

    private modeloAtual: THREE.Object3D | null = null;
    private bboxOriginal = new THREE.Box3();
    private modeloGLBCache: THREE.Group | null = null;
    private descartado = false;

    // temporários reutilizados a cada frame (evita alocar no loop)
    private readonly tmpEscala = new THREE.Vector3();

    constructor(
        scene: THREE.Scene,
        private readonly veiculo: Veiculo,
        material: THREE.Material,
        private readonly config = GAME_CONFIG,
    ) {
        this.chassi.matrixAutoUpdate = false;
        this.chassi.frustumCulled = false;
        scene.add(this.chassi);

        this.rodasGLBGroup.matrixAutoUpdate = false;
        scene.add(this.rodasGLBGroup);

        this.chassiProcedural = new THREE.Mesh(geometriaDe(veiculo.gerarMalhaChassi()), material);
        this.chassiProcedural.frustumCulled = false;
        this.chassiProcedural.matrixAutoUpdate = true;
        this.chassi.add(this.chassiProcedural);

        const geoRoda = geometriaDe(veiculo.gerarMalhaRoda());
        for (let i = 0; i < 4; ++i) {
            const m = new THREE.Mesh(geoRoda, material);
            m.frustumCulled = false;
            m.matrixAutoUpdate = false;
            this.rodasProcedurais.push(m);
            scene.add(m);
        }
    }

    // ---------- carregamento do modelo .glb ----------

    /** carrega o modelo padrão (opcional: se não existir, o carro procedural continua) */
    carregarModeloPadrao(url = './carro.glb') {
        new GLTFLoader().load(url, (gltf) => {
            if (this.descartado) return;
            prepararModelo(gltf.scene);
            this.modeloGLBCache = gltf.scene;
        }, undefined, () => { console.log('carro.glb não encontrado em /public.'); });
    }

    /** lê um .glb enviado pelo usuário e o guarda como modelo atual (lança erro se falhar) */
    async importarArquivo(arquivo: File) {
        const buffer = await arquivo.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buffer, '');
        if (this.descartado) return;
        prepararModelo(gltf.scene);
        const anterior = this.modeloGLBCache;
        this.modeloGLBCache = gltf.scene;
        if (anterior) liberarModelo(anterior);
    }

    // ---------- troca entre carro procedural e modelo .glb ----------

    /** mostra o modelo guardado (se houver); sem modelo, o chassi fica vazio */
    aplicarModeloEmCache() {
        this.limparChassi();
        if (this.modeloGLBCache) this.aplicarModelo(this.modeloGLBCache.clone());
    }

    /** volta para o carro procedural */
    mostrarProcedural() {
        this.limparChassi();
        this.modeloAtual = null;
        this.limparRodasGLB();
        this.rodasProcedurais.forEach((m) => { m.visible = true; });

        this.chassiProcedural.geometry.dispose();
        this.chassiProcedural.geometry = geometriaDe(this.veiculo.gerarMalhaChassi());
        this.chassi.add(this.chassiProcedural);
    }

    /** reconstrói a geometria das rodas (após mudar raio, largura ou segmentos) */
    reconstruirRodas() {
        const geoRoda = geometriaDe(this.veiculo.gerarMalhaRoda());
        this.rodasProcedurais[0]?.geometry.dispose();
        this.rodasProcedurais.forEach((m) => { m.geometry = geoRoda; });
    }

    /** o painel mudou dimensões/rodas: reajusta o modelo (ou recria o chassi procedural) e as rodas */
    atualizarDimensoes() {
        if (this.modeloAtual) {
            this.ajustarModeloAoCarro();
        } else {
            this.chassiProcedural.geometry.dispose();
            this.chassiProcedural.geometry = geometriaDe(this.veiculo.gerarMalhaChassi());
        }
        this.reconstruirRodas();
    }

    // ---------- frame ----------

    /** copia a pose da física (chassi e 4 rodas) para os objetos da cena */
    atualizar() {
        this.aplicarMatriz(this.chassi, this.veiculo.matrizChassi());

        this.veiculo.matrizesRodas().forEach((m, i) => {
            const wrapper = this.rodasGLB[i];
            if (wrapper) {
                const fator = this.config.carro.rodas.raio / Math.max(0.001, this.raiosOriginaisGLB[i]);
                wrapper.matrix.fromArray(m.m).multiply(ROT_RODA_GLB).scale(this.tmpEscala.set(fator, fator, fator));
                wrapper.matrixWorldNeedsUpdate = true;
            } else {
                this.aplicarMatriz(this.rodasProcedurais[i], m);
            }
        });
    }

    dispose() {
        this.descartado = true;
        if (this.modeloGLBCache) liberarModelo(this.modeloGLBCache);
        this.modeloGLBCache = null;
    }

    // ---------- internos ----------

    private aplicarMatriz(obj: THREE.Object3D | undefined, m: Mat4) {
        if (!obj) return;
        obj.matrix.fromArray(m.m);
        obj.matrixWorldNeedsUpdate = true;
    }

    private limparChassi() {
        while (this.chassi.children.length > 0) this.chassi.remove(this.chassi.children[0]);
    }

    private limparRodasGLB() {
        while (this.rodasGLBGroup.children.length > 0) this.rodasGLBGroup.remove(this.rodasGLBGroup.children[0]);
        this.rodasGLB = [null, null, null, null];
        this.raiosOriginaisGLB = [];
    }

    private aplicarModelo(modelo: THREE.Object3D) {
        this.limparChassi();
        this.limparRodasGLB();
        this.rodasProcedurais.forEach((m) => { m.visible = true; });

        modelo.position.set(0, 0, 0);
        modelo.rotation.set(0, 0, 0);
        modelo.scale.set(1, 1, 1);
        modelo.updateMatrixWorld(true);

        const rodas = ['wheelfl', 'wheelfr', 'wheelrl', 'wheelrr'].map((nome) => this.encontrarPorNome(modelo, nome));
        if (rodas.every((r) => r)) {
            this.rodasProcedurais.forEach((m) => { m.visible = false; });
            // 1. extrair as rodas ANTES de medir o carro
            (rodas as THREE.Object3D[]).forEach((r, i) => this.extrairRoda(r, i));
            // 2. só agora medimos a caixa do carro (sem as rodas)
            modelo.updateMatrixWorld(true);
        }

        this.bboxOriginal = new THREE.Box3().setFromObject(modelo);
        this.modeloAtual = modelo;
        this.ajustarModeloAoCarro();

        modelo.matrixAutoUpdate = true;
        this.chassi.add(modelo);
    }

    private encontrarPorNome(modelo: THREE.Object3D, nomeBuscado: string): THREE.Object3D | null {
        const normalizar = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const busca = normalizar(nomeBuscado);
        let encontrada: THREE.Object3D | null = null;
        modelo.traverse((child) => {
            if (!encontrada && normalizar(child.name).includes(busca)) encontrada = child;
        });
        return encontrada;
    }

    /** tira a roda do modelo, centraliza seu pivô e a coloca num wrapper controlado pela física */
    private extrairRoda(r: THREE.Object3D, indice: number) {
        const wrapper = new THREE.Group();
        wrapper.matrixAutoUpdate = false;
        wrapper.add(r);

        wrapper.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(r);
        const size = new THREE.Vector3();
        box.getSize(size);
        this.raiosOriginaisGLB.push(Math.max(size.x, size.y, size.z) / 2);

        const centroMundo = new THREE.Vector3();
        box.getCenter(centroMundo);
        const centroLocal = r.worldToLocal(centroMundo.clone());

        if ((r as THREE.Mesh).isMesh && (r as THREE.Mesh).geometry) {
            (r as THREE.Mesh).geometry.translate(-centroLocal.x, -centroLocal.y, -centroLocal.z);
        }
        for (const filho of [...r.children]) filho.position.sub(centroLocal);

        // sem rotação manual aqui: ela conflitava com a rotação aplicada em atualizar()
        r.position.set(0, 0, 0);
        r.rotation.set(0, 0, 0);
        r.scale.set(1, 1, 1);

        this.rodasGLBGroup.add(wrapper);
        this.rodasGLB[indice] = wrapper;
    }

    /** escala o modelo para o comprimento configurado e o centraliza sobre o chassi */
    private ajustarModeloAoCarro() {
        if (!this.modeloAtual || this.bboxOriginal.isEmpty()) return;
        const size = new THREE.Vector3();
        this.bboxOriginal.getSize(size);

        const dimMaior = Math.max(size.z, size.x);
        const escala = dimMaior > 0 ? this.config.carro.dimensoes.comprimento / dimMaior : 1;
        this.modeloAtual.scale.setScalar(escala);

        const centro = new THREE.Vector3();
        this.bboxOriginal.getCenter(centro);
        this.modeloAtual.position.set(
            -centro.x * escala,
            -this.bboxOriginal.min.y * escala + OFFSET_BASE_MODELO_Y + this.config.carro.dimensoes.alturachao,
            -centro.z * escala,
        );
    }
}
