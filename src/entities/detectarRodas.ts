// detectarRodas.ts — acha as 4 rodas de um .glb que NÃO usa os nomes wheelFL/FR/RL/RR.
//
// Duas tentativas, nesta ordem:
//  1. por nome: peças cujo nome tem "wheel", "tire", "rim", "roda", "pneu"... (em várias línguas), separadas pelos
//     quatro cantos do carro;
//  2. por forma: em cada canto, o pneu é a peça baixa, encostada no chão, redonda vista de lado (altura ~ comprimento)
//     e mais estreita na largura; aro, disco e parafusos são as peças que cabem dentro dele.
// O lado de cada roda (FE, FD, TE, TD) quem decide é o CarroVisual, pela posição; aqui só se separam as 4 rodas.
// Supõe o carro como o glTF manda: em pé no eixo Y, olhando para +Z (o eixo das rodas é X), como o resto do jogo.
import * as THREE from 'three';

export interface RodasDetectadas {
    /** uma por canto do carro; quando a roda tem várias peças, elas vêm juntas num Group (já fora do modelo) */
    rodas: THREE.Object3D[];
    /** como foram achadas (para o console) */
    metodo: string;
}

const PALAVRAS_RODA = ['wheel', 'tire', 'tyre', 'rim', 'roda', 'pneu', 'rueda', 'llanta', 'reifen', 'felge', 'ruota', 'cerchio', 'roue', 'jante'];
/** volante e estepe: nada dentro deles é roda, tenha o nome que tiver */
const EXCLUIR_SEMPRE = ['steer', 'volante', 'lenkrad', 'spare', 'estepe'];
/** partes da carroceria que têm "wheel" no nome (caixa de roda, para-lama, calota de enfeite...) */
const EXCLUIR_COM_RODA = ['arch', 'house', 'well', 'cover', 'guard', 'liner', 'fender', 'logo', 'badge', 'reserva'];

interface Parte {
    obj: THREE.Object3D;
    caixa: THREE.Box3;
    centro: THREE.Vector3;
    tam: THREE.Vector3;
}

interface Carro { caixa: THREE.Box3; centro: THREE.Vector3; tam: THREE.Vector3 }

function medir(obj: THREE.Object3D): Parte | null {
    const caixa = new THREE.Box3().setFromObject(obj);
    if (caixa.isEmpty()) return null;
    return { obj, caixa, centro: caixa.getCenter(new THREE.Vector3()), tam: caixa.getSize(new THREE.Vector3()) };
}

/** palavras do nome: separa camelCase, números e símbolos ("WheelFL_rim01" -> wheel, fl, rim) */
function palavras(nome: string): string[] {
    return nome.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

const temPalavra = (p: string[], lista: string[]) => p.some((t) => lista.some((k) => t.startsWith(k)));

function ehNomeDeRoda(nome: string): boolean {
    const p = palavras(nome);
    return temPalavra(p, PALAVRAS_RODA) && !temPalavra(p, EXCLUIR_SEMPRE) && !temPalavra(p, EXCLUIR_COM_RODA);
}

/** o nó (e tudo dentro dele) não pode ser roda: volante, estepe, ou "wheel" + parte da carroceria */
function ehExcluido(nome: string): boolean {
    const p = palavras(nome);
    return temPalavra(p, EXCLUIR_SEMPRE) || (temPalavra(p, PALAVRAS_RODA) && temPalavra(p, EXCLUIR_COM_RODA));
}

/** canto do carro: 0 = frente/-x, 1 = frente/+x, 2 = trás/-x, 3 = trás/+x (a frente é +z) */
const canto = (p: Parte, carro: Carro) => (p.centro.z >= carro.centro.z ? 0 : 2) + (p.centro.x >= carro.centro.x ? 1 : 0);

/** junta as peças de uma roda num Group, mantendo a posição de cada uma (o Group sai do modelo) */
function juntar(partes: THREE.Object3D[]): THREE.Object3D {
    if (partes.length === 1) return partes[0];
    const g = new THREE.Group();
    g.name = 'roda (detectada)';
    for (const p of partes) g.attach(p);      // attach preserva a transformação de mundo (o modelo está na identidade)
    g.updateMatrixWorld(true);
    return g;
}

/** tira da lista as peças que já estão dentro de outra da lista (a de cima já as leva junto) */
function semDescendentes(objs: THREE.Object3D[]): THREE.Object3D[] {
    const conjunto = new Set(objs);
    return objs.filter((o) => {
        for (let p = o.parent; p; p = p.parent) if (conjunto.has(p)) return false;
        return true;
    });
}

/** a caixa de uma roda: redonda vista de lado e não maior que o carro */
function pareceRoda(c: THREE.Vector3, carro: Carro): boolean {
    const razao = c.y / Math.max(c.z, 1e-6);
    return razao > 0.6 && razao < 1.7 && c.y < carro.tam.y * 0.8 && c.x < carro.tam.x * 0.45;
}

// ---------- 1. por nome ----------

function porNome(modelo: THREE.Object3D, carro: Carro): RodasDetectadas | null {
    // um nó com nome de roda que cabe num canto do carro é uma roda (ou parte dela); um que atravessa o carro (ex.: um
    // grupo "Wheels" com as quatro) não serve inteiro, então a busca desce nele e os filhos valem mesmo sem nome
    const partes: Parte[] = [];
    const cabeNumCanto = (p: Parte) => p.tam.x < carro.tam.x * 0.45 && p.tam.z < carro.tam.z * 0.45;
    const coletar = (o: THREE.Object3D, dentroDeRoda: boolean) => {
        if (o !== modelo && ehExcluido(o.name)) return;
        const deRoda = dentroDeRoda || (o !== modelo && ehNomeDeRoda(o.name));
        if (deRoda) {
            const p = medir(o);
            if (!p) return;
            if (cabeNumCanto(p)) { partes.push(p); return; }
        }
        for (const filho of o.children) coletar(filho, deRoda);
    };
    coletar(modelo, false);
    if (partes.length < 4) return null;

    const grupos: Parte[][] = [[], [], [], []];
    for (const p of partes) grupos[canto(p, carro)].push(p);
    if (grupos.some((g) => g.length === 0)) return null;

    // cada canto precisa parecer uma roda (evita pegar, por exemplo, só os aros de um lado e outra peça no outro)
    for (const g of grupos) {
        const caixa = new THREE.Box3();
        for (const p of g) caixa.union(p.caixa);
        if (!pareceRoda(caixa.getSize(new THREE.Vector3()), carro)) return null;
    }
    const nomes = partes.map((p) => p.obj.name).slice(0, 8).join(', ');
    return { rodas: grupos.map((g) => juntar(g.map((p) => p.obj))), metodo: `pelos nomes (${nomes}${partes.length > 8 ? ', ...' : ''})` };
}

// ---------- 2. por forma e posição ----------

function porForma(modelo: THREE.Object3D, carro: Carro): RodasDetectadas | null {
    const meshes: Parte[] = [];
    modelo.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        const p = medir(o);
        if (p) meshes.push(p);
    });
    const H = carro.tam.y, W = carro.tam.x, chao = carro.caixa.min.y;

    // pneus candidatos: redondos de lado, mais estreitos que altos, encostados no chão, baixos e afastados do meio
    const pneus = meshes.filter((p) => {
        const { x: dx, y: dy, z: dz } = p.tam;
        const razao = dy / Math.max(dz, 1e-6);
        return dy > H * 0.15 && dy < H * 0.75
            && razao > 0.75 && razao < 1.33
            && dx < dy * 0.85
            && p.caixa.min.y < chao + H * 0.12
            && p.centro.y < chao + H * 0.5
            && Math.abs(p.centro.x - carro.centro.x) > W * 0.15;
    });

    // em cada canto, o maior candidato (o pneu; o aro é menor e fica dentro dele)
    const escolhidos: (Parte | null)[] = [null, null, null, null];
    for (const p of pneus) {
        const k = canto(p, carro), atual = escolhidos[k];
        if (!atual || p.tam.y > atual.tam.y) escolhidos[k] = p;
    }
    if (escolhidos.some((p) => !p)) return null;
    const quatro = escolhidos as Parte[];

    // as 4 do mesmo tamanho e formando um retângulo: eixos retos e cada eixo centrado no carro
    const media = quatro.reduce((s, p) => s + p.tam.y, 0) / 4;
    if (quatro.some((p) => Math.abs(p.tam.y - media) > media * 0.25)) return null;
    for (const [a, b] of [[0, 1], [2, 3]]) {
        if (Math.abs(quatro[a].centro.z - quatro[b].centro.z) > media * 0.5) return null;
        if (Math.abs((quatro[a].centro.x + quatro[b].centro.x) / 2 - carro.centro.x) > W * 0.15) return null;
    }

    // aro, disco, parafusos...: as peças que cabem dentro do pneu (com uma folga na largura) vão junto com ele
    const usados = new Set<THREE.Object3D>(quatro.map((p) => p.obj));
    const rodas = quatro.map((pneu) => {
        const folga = pneu.tam.y * 0.15;
        const dentro = pneu.caixa.clone().expandByVector(new THREE.Vector3(folga, folga * 0.3, folga * 0.3));
        const pecas = [pneu.obj];
        for (const p of meshes) {
            if (usados.has(p.obj) || p.tam.y > pneu.tam.y * 1.05) continue;
            if (!dentro.containsBox(p.caixa)) continue;
            usados.add(p.obj);
            pecas.push(p.obj);
        }
        return juntar(semDescendentes(pecas));
    });
    const pecasPorRoda = rodas.map((r) => (r instanceof THREE.Group && r.name === 'roda (detectada)' ? r.children.length : 1));
    return { rodas, metodo: `pela forma e posição (peças por roda: ${pecasPorRoda.join(', ')})` };
}

/** procura as 4 rodas; null se não achar (o carro fica com as rodas do jogo). O modelo deve estar na identidade. */
export function detectarRodas(modelo: THREE.Object3D): RodasDetectadas | null {
    modelo.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(modelo);
    if (caixa.isEmpty()) return null;
    const carro: Carro = { caixa, centro: caixa.getCenter(new THREE.Vector3()), tam: caixa.getSize(new THREE.Vector3()) };
    return porNome(modelo, carro) ?? porForma(modelo, carro);
}
