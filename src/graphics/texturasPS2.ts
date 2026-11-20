// texturasPS2.ts   texturas do modo PS2, geradas por código (nenhum arquivo de imagem).
//
// Todas são TILEÁVEIS (o ruído é periódico: a borda direita emenda com a esquerda) e de 256x256, com mipmap.
// O conteúdo é "detalhe", não cor: a média fica em 0,5 e o shader multiplica por 2 (como o modulate x2 do PS2),
// então 0,5 = não muda nada na cor do vértice (bioma, altitude), mais claro clareia e mais escuro escurece.
// Quando você tiver texturas pintadas à mão, basta trocar o conteúdo de `texturasChao()` por elas.

import * as THREE from 'three';

/** tamanho (unidades do mundo) de uma repetição de cada textura do chão; o shader recebe os mesmos valores */
export const TILE_CHAO = { gramaFino: 70, gramaGrosso: 640, asfaltoFino: 36, asfaltoGrosso: 420, superficieFino: 90, superficieGrosso: 520 };

const TAM = 256;

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Ruído de valor periódico: um reticulado px x py de valores sorteados, interpolado com smoothstep.
 * px = py = TAM dá ruído branco (cada pixel cai exatamente num ponto do reticulado).
 * px diferente de py estica o ruído: poucas mudanças num eixo e muitas no outro (riscos).
 */
function ruido(rng: () => number, px: number, py: number): Float32Array {
    const grade = new Float32Array(px * py);
    for (let i = 0; i < grade.length; ++i) grade[i] = rng();
    const out = new Float32Array(TAM * TAM);
    for (let y = 0; y < TAM; ++y) {
        const fy = y * py / TAM, j0 = Math.floor(fy), ty = fy - j0, sy = ty * ty * (3 - 2 * ty), j1 = (j0 + 1) % py;
        for (let x = 0; x < TAM; ++x) {
            const fx = x * px / TAM, i0 = Math.floor(fx), tx = fx - i0, sx = tx * tx * (3 - 2 * tx), i1 = (i0 + 1) % px;
            const a = grade[j0 * px + i0], b = grade[j0 * px + i1], c = grade[j1 * px + i0], d = grade[j1 * px + i1];
            out[y * TAM + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
        }
    }
    return out;
}

function somaPonderada(campos: [Float32Array, number][]): Float32Array {
    const out = new Float32Array(TAM * TAM);
    for (const [campo, peso] of campos) for (let i = 0; i < out.length; ++i) out[i] += campo[i] * peso;
    return out;
}

/** reescala para média 0,5 e o desvio pedido (em unidades da textura: 0,10 = +-20% depois do x2 do shader; as duas camadas se multiplicam) */
function normalizar(campo: Float32Array, desvio: number): Float32Array {
    let soma = 0;
    for (let i = 0; i < campo.length; ++i) soma += campo[i];
    const media = soma / campo.length;
    let v = 0;
    for (let i = 0; i < campo.length; ++i) v += (campo[i] - media) * (campo[i] - media);
    const dp = Math.sqrt(v / campo.length) || 1;
    const out = new Float32Array(campo.length);
    for (let i = 0; i < campo.length; ++i) out[i] = 0.5 + (campo[i] - media) / dp * desvio;
    return out;
}

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** grama: manchas largas, manchas médias, riscos finos na vertical (lâminas) e granulado; leve variação de tom */
export function pixelsGrama(): Uint8Array {
    const rng = mulberry32(0x6a7a);
    const t = normalizar(somaPonderada([
        [ruido(rng, 4, 4), 0.26], [ruido(rng, 8, 8), 0.20], [ruido(rng, 16, 16), 0.16],
        [ruido(rng, 32, 32), 0.12], [ruido(rng, 128, 20), 0.14], [ruido(rng, TAM, TAM), 0.12],
    ]), 0.10);
    const tom = ruido(rng, 6, 6);
    const px = new Uint8Array(TAM * TAM * 4);
    for (let i = 0; i < TAM * TAM; ++i) {
        const m = (tom[i] - 0.5) * 0.12;        // amarelado <-> azulado
        px[i * 4] = byte(t[i] + m); px[i * 4 + 1] = byte(t[i]); px[i * 4 + 2] = byte(t[i] - m * 1.2); px[i * 4 + 3] = 255;
    }
    return px;
}

/**
 * Superfícies do terreno (rocha, neve, areia, terra de outono) num único RGBA: um detalhe em tons de cinza por canal
 * (R rocha, G neve, B areia, A terra). Como o da grama, só traz o que VARIA (média 0,5 = neutro depois do x4 das duas
 * escalas); a cor continua vindo do bioma, no vértice. Cada canal tem seu desenho:
 *  - rocha: rachaduras escuras, camadas horizontais (estratos) e manchas;
 *  - neve: quase lisa, com ondulações suaves (vento) e raros pontos de brilho;
 *  - areia: marcas de vento (ondulações finas que serpenteiam) e granulado;
 *  - terra de outono: torrões escuros e folhas secas (pontinhos claros e escuros).
 */
export function pixelsSuperficies(): Uint8Array {
    const rng = mulberry32(0x5b9f1);
    const px = new Uint8Array(TAM * TAM * 4);

    // rocha
    const base = somaPonderada([[ruido(rng, 4, 4), 0.30], [ruido(rng, 12, 12), 0.25], [ruido(rng, 48, 48), 0.20], [ruido(rng, TAM, TAM), 0.25]]);
    const estratos = ruido(rng, 3, 40);
    const fenda = ruido(rng, 9, 9), fenda2 = ruido(rng, 22, 22);
    const rocha = normalizar(somaPonderada([[base, 0.6], [estratos, 0.4]]), 0.12);
    for (let i = 0; i < TAM * TAM; ++i) {
        const r = Math.max(1 - Math.abs(fenda[i] - 0.5) / 0.035, 1 - Math.abs(fenda2[i] - 0.5) / 0.03, 0);   // linhas finas onde o ruído cruza 0,5
        px[i * 4] = byte(rocha[i] - 0.22 * Math.min(r, 1));
    }

    // neve
    const neve = normalizar(somaPonderada([[ruido(rng, 5, 5), 0.5], [ruido(rng, 20, 20), 0.3], [ruido(rng, 96, 24), 0.2]]), 0.055);
    const brilho = ruido(rng, TAM, TAM);
    for (let i = 0; i < TAM * TAM; ++i) px[i * 4 + 1] = byte(neve[i] + (brilho[i] > 0.985 ? 0.10 : 0));

    // areia: ondulações = seno de uma coordenada entortada pelo ruído (ciclos inteiros: a textura repete sem emenda)
    const entorta = ruido(rng, 4, 4), entorta2 = ruido(rng, 12, 12), graos = ruido(rng, TAM, TAM), manchas = ruido(rng, 6, 6);
    for (let y = 0; y < TAM; ++y) for (let x = 0; x < TAM; ++x) {
        const i = y * TAM + x;
        const onda = Math.sin(((y / TAM) * 14 + 1.6 * entorta[i] + 0.5 * entorta2[i]) * Math.PI * 2);
        px[i * 4 + 2] = byte(0.5 + 0.08 * onda + 0.08 * (graos[i] - 0.5) + 0.10 * (manchas[i] - 0.5));
    }

    // terra de outono
    const torroes = normalizar(somaPonderada([[ruido(rng, 6, 6), 0.3], [ruido(rng, 16, 16), 0.3], [ruido(rng, 48, 48), 0.25], [ruido(rng, TAM, TAM), 0.15]]), 0.11);
    const folhas = ruido(rng, TAM, TAM);
    for (let i = 0; i < TAM * TAM; ++i) {
        let v = torroes[i];
        if (folhas[i] > 0.955) v += 0.20; else if (folhas[i] < 0.03) v -= 0.17;
        px[i * 4 + 3] = byte(v);
    }
    return px;
}

/** asfalto: granulado forte, manchas suaves e pedrinhas claras e escuras esparsas; cinza puro (a cor vem do vértice) */
export function pixelsAsfalto(): Uint8Array {
    const rng = mulberry32(0xa5fa17);
    const t = normalizar(somaPonderada([
        [ruido(rng, 4, 4), 0.10], [ruido(rng, 16, 16), 0.10], [ruido(rng, 64, 64), 0.18],
        [ruido(rng, 128, 128), 0.22], [ruido(rng, TAM, TAM), 0.40],
    ]), 0.10);
    const pedra = ruido(rng, TAM, TAM);
    const px = new Uint8Array(TAM * TAM * 4);
    for (let i = 0; i < TAM * TAM; ++i) {
        let v = t[i];
        if (pedra[i] > 0.992) v += 0.18; else if (pedra[i] < 0.006) v -= 0.16;
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = byte(v); px[i * 4 + 3] = 255;
    }
    return px;
}

/** atlas das árvores: 4 coníferas lado a lado, cada uma numa célula de 128x256 (a linha 0 é a BASE da árvore) */
export const ARVORE_ATLAS = { celulas: 4, largura: 128, altura: 256 };

/**
 * 4 coníferas pintadas por código: copa em andares (cada andar é mais largo embaixo, com um degrau para dentro no
 * seguinte), tronco curto, sombra embaixo de cada andar e agulhas em pontinhos. A luz já está pintada na textura (o
 * shader da árvore quase não ilumina), como nas árvores de cartão do PS2. O RGB das áreas transparentes é a cor média
 * da folha, para o filtro bilinear e os mipmaps não criarem contorno escuro em volta da silhueta.
 */
export function pixelsArvores(): Uint8Array {
    const { celulas: NC, largura: CW, altura: CH } = ARVORE_ATLAS;
    const W = NC * CW, px = new Uint8Array(W * CH * 4);
    const andares = [6, 7, 8, 6], largura = [0.44, 0.40, 0.46, 0.38], recuo = [0.20, 0.26, 0.18, 0.24], curva = [0, 0.025, -0.02, 0.012];
    const hash = (x: number, y: number, s: number) => {
        let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const lim = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const suave = (a: number, b: number, v: number) => { const t = lim((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const escuro = [0.05, 0.095, 0.05], meio = [0.125, 0.205, 0.08], claro = [0.27, 0.35, 0.16], tronco = [0.18, 0.12, 0.07];   // olivo escuro, como as coníferas do GT4
    const rampa = (L: number): number[] => {
        const a = L < 0.6 ? escuro : meio, b = L < 0.6 ? meio : claro, t = L < 0.6 ? suave(0.25, 0.6, L) : suave(0.6, 1.05, L);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    };

    for (let c = 0; c < NC; ++c) for (let py = 0; py < CH; ++py) for (let pxl = 0; pxl < CW; ++pxl) {
        const u = (pxl + 0.5) / CW - 0.5, t = (py + 0.5) / CH;        // t: 0 = base .. 1 = ponta
        const base = 0.06 + 0.012 * hash(Math.floor((u + 0.5) * 20), 0, c + 5);   // base da copa irregular
        let a = 0, cor = meio;
        if (t > base) {
            const s = (t - base) / (1 - base), f = 1 - s;               // s: 0 = base da copa, 1 = ponta; f ao contrário
            const fa = f * andares[c], ph = fa - Math.floor(fa);        // ph: posição dentro do andar (0 = em cima, 1 = embaixo)
            const irr = 1 + 0.14 * (hash(py >> 1, 0, c + 11) - 0.5);    // borda irregular, de 2 em 2 linhas
            const w = largura[c] * Math.pow(f, 0.88) * (1 - recuo[c] * (1 - ph)) * irr;
            const d = Math.abs(u - curva[c] * s);
            a = lim((w - d) * CW + 0.5, 0, 1);
            if (a > 0) {
                const sombra = 0.50 + 0.50 * suave(0, 0.55, ph);        // escuro logo abaixo do andar de cima
                const borda = 0.8 + 0.35 * lim(d / Math.max(w, 1e-3), 0, 1);
                const alto = 0.72 + 0.28 * s;
                const agulha = 0.86 + 0.28 * hash(pxl >> 1, py >> 1, c * 3 + 1);
                cor = rampa(sombra * borda * alto * agulha);
            }
        }
        if (a < 1 && t < 0.11 && Math.abs(u) < 0.03) { cor = tronco; a = 1; }   // tronco aparece sob a copa
        const k = ((py * W) + c * CW + pxl) * 4;
        px[k] = byte(cor[0]); px[k + 1] = byte(cor[1]); px[k + 2] = byte(cor[2]); px[k + 3] = Math.round(a * 255);
    }
    return px;
}

/**
 * Textura da camada de nuvens do céu (256x256, tileável): R = forma grande das nuvens (poucas manchas largas e bordas
 * suaves), G = detalhe fino (franjas e grumos). O shader da cúpula lê as duas em escalas diferentes e as soma; o limiar
 * de cobertura decide quanto do céu fica coberto. Média 0,5 em cada canal.
 */
export function pixelsNuvensCeu(): Uint8Array {
    const rng = mulberry32(0xc10d5);
    const forma = normalizar(somaPonderada([
        [ruido(rng, 4, 4), 0.38], [ruido(rng, 8, 8), 0.30], [ruido(rng, 16, 16), 0.20], [ruido(rng, 32, 32), 0.12],
    ]), 0.17);
    const fino = normalizar(somaPonderada([
        [ruido(rng, 8, 8), 0.30], [ruido(rng, 16, 16), 0.30], [ruido(rng, 32, 32), 0.22], [ruido(rng, 64, 64), 0.18],
    ]), 0.17);
    const px = new Uint8Array(TAM * TAM * 4);
    for (let i = 0; i < TAM * TAM; ++i) {
        px[i * 4] = byte(forma[i]); px[i * 4 + 1] = byte(fino[i]); px[i * 4 + 2] = 128; px[i * 4 + 3] = 255;
    }
    return px;
}

function criarTextura(dados: Uint8Array, largura = TAM, altura = TAM, repetir = true): THREE.DataTexture {
    const tex = new THREE.DataTexture(dados, largura, altura, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = tex.wrapT = repetir ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;       // o chão é visto quase de lado; o three limita ao máximo que a GPU suporta
    tex.needsUpdate = true;
    return tex;
}

let cacheGrama: THREE.DataTexture | null = null;
let cacheAsfalto: THREE.DataTexture | null = null;
let cacheArvores: THREE.DataTexture | null = null;
let cacheNuvens: THREE.DataTexture | null = null;
let cacheSuperficies: THREE.DataTexture | null = null;
let geracao = 0;      // sobe a cada liberarTexturasPS2: um carregamento de arquivo que termina depois disso é descartado

/** texturas do chão; geradas na primeira vez que o estilo PS2 é ligado (uns poucos ms) e guardadas depois */
export function texturasChao() {
    if (!cacheGrama) cacheGrama = criarTextura(pixelsGrama());
    if (!cacheAsfalto) cacheAsfalto = criarTextura(pixelsAsfalto());
    return { grama: cacheGrama, asfalto: cacheAsfalto };
}

// ---------------------------------------------------------------------------------------------------------------
// Texturas de ARQUIVO (opcionais): public/texturas/grama.jpg. Se o arquivo existir, a foto substitui a grama gerada
// por código; se não existir, nada muda (nenhum erro, nenhum aviso).
// ---------------------------------------------------------------------------------------------------------------

/** pasta das texturas, relativa à página (mesmo padrão do ./carro.glb): em public/texturas/ */
const PASTA_TEXTURAS = './texturas/';
/** fotos grandes (1K, 2K, 4K) são reduzidas para este tamanho: o PS2 usava texturas pequenas e o mipmap fica barato */
const TAM_EXTERNA = 512;

/** lê public/texturas/<nome> e devolve os pixels RGBA redimensionados para `tamanho` x `tamanho`; null se não existir ou não abrir */
export async function lerPixelsDeImagem(nome: string, tamanho = TAM_EXTERNA): Promise<Uint8ClampedArray | null> {
    const img = await abrirImagem(nome);
    if (!img) return null;
    try {
        const ctx = novoContexto(tamanho, tamanho);
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, tamanho, tamanho);
        return ctx.getImageData(0, 0, tamanho, tamanho).data;
    } catch { return null; }
}

/** abre public/texturas/<nome>; null se não existir ou não abrir */
function abrirImagem(nome: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = PASTA_TEXTURAS + nome;
    });
}

function novoContexto(w: number, h: number): CanvasRenderingContext2D | null {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
    return ctx;
}

// ---------- árvores de ARQUIVO (opcionais): public/texturas/arvore1.png .. arvore4.png ----------
// Cada PNG que existir substitui a conífera do mesmo número no atlas; as que faltarem continuam desenhadas por código.
// O PNG precisa de fundo transparente. As margens vazias são cortadas e a árvore é encaixada na célula sem distorcer,
// centralizada e com a base do tronco na borda de baixo (onde o cartão encosta no chão). Com algum PNG, o atlas passa
// a ter o dobro da resolução (256x512 por árvore); as células desenhadas por código são só ampliadas.

/** resolução de cada célula do atlas quando há árvores de arquivo */
const ARVORE_PNG = { largura: 256, altura: 512 };

/** recorta a árvore do PNG (pelo alfa) e a encaixa numa célula w x h; pixels com a linha 0 = BASE, como o atlas */
function celulaDeImagem(img: HTMLImageElement, w: number, h: number): Uint8Array | null {
    // 1. a imagem inteira (limitada a 2048 px no lado maior) para achar a caixa do que não é transparente
    const esc = Math.min(1, 2048 / Math.max(img.width, img.height));
    const iw = Math.max(1, Math.round(img.width * esc)), ih = Math.max(1, Math.round(img.height * esc));
    const ctxImg = novoContexto(iw, ih);
    if (!ctxImg) return null;
    ctxImg.drawImage(img, 0, 0, iw, ih);
    const dados = ctxImg.getImageData(0, 0, iw, ih).data;
    let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
    for (let y = 0; y < ih; ++y) for (let x = 0; x < iw; ++x) {
        if (dados[(y * iw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;                                  // imagem toda transparente
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

    // 2. encaixa sem distorcer: centralizada na horizontal, base embaixo
    const k = Math.min(w / cw, h / ch);
    const dw = cw * k, dh = ch * k;
    const ctx = novoContexto(w, h);
    if (!ctx) return null;
    ctx.drawImage(ctxImg.canvas, x0, y0, cw, ch, (w - dw) / 2, h - dh, dw, dh);
    const src = ctx.getImageData(0, 0, w, h).data;

    // 3. vira de cabeça para baixo (no atlas a linha 0 é a base) e pinta o RGB dos pixels transparentes com a cor média
    //    da folhagem: o filtro bilinear e os mipmaps não criam contorno escuro em volta da silhueta
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < src.length; i += 4) if (src[i + 3] > 200) { r += src[i]; g += src[i + 1]; b += src[i + 2]; ++n; }
    const media = n ? [r / n, g / n, b / n] : [40, 60, 30];
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; ++y) for (let x = 0; x < w; ++x) {
        const s = (y * w + x) * 4, d = ((h - 1 - y) * w + x) * 4;
        if (src[s + 3] === 0) { out[d] = media[0]; out[d + 1] = media[1]; out[d + 2] = media[2]; out[d + 3] = 0; continue; }
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
    }
    return out;
}

/**
 * Procura public/texturas/arvore1.png .. arvore4.png. Devolve o atlas novo (256x512 por árvore; as que não têm
 * arquivo vêm do desenho por código, ampliadas) e a lista do que foi lido; null se não houver nenhum PNG.
 */
export async function carregarTexturaArvores(): Promise<{ textura: THREE.DataTexture; arquivos: string[] } | null> {
    const minha = geracao;
    const nomes = Array.from({ length: ARVORE_ATLAS.celulas }, (_, i) => `arvore${i + 1}.png`);
    const imagens = await Promise.all(nomes.map(abrirImagem));
    if (minha !== geracao || imagens.every(i => !i)) return null;

    const { largura: CW, altura: CH } = ARVORE_PNG;
    const NC = ARVORE_ATLAS.celulas, W = NC * CW;
    const atlas = new Uint8Array(W * CH * 4);
    const proc = pixelsArvores();                              // células sem arquivo: o desenho por código
    const pW = NC * ARVORE_ATLAS.largura, fx = ARVORE_ATLAS.largura / CW, fy = ARVORE_ATLAS.altura / CH;
    const arquivos: string[] = [];
    for (let c = 0; c < NC; ++c) {
        const cel = imagens[c] ? celulaDeImagem(imagens[c]!, CW, CH) : null;
        if (cel) arquivos.push(nomes[c]);
        for (let y = 0; y < CH; ++y) for (let x = 0; x < CW; ++x) {
            const d = (y * W + c * CW + x) * 4;
            const s = cel ? (y * CW + x) * 4 : (Math.floor(y * fy) * pW + c * ARVORE_ATLAS.largura + Math.floor(x * fx)) * 4;
            const fonte = cel ?? proc;
            atlas[d] = fonte[s]; atlas[d + 1] = fonte[s + 1]; atlas[d + 2] = fonte[s + 2]; atlas[d + 3] = fonte[s + 3];
        }
    }
    if (arquivos.length === 0) return null;
    return { textura: criarTextura(atlas, W, CH, false), arquivos };
}

/** troca o atlas das árvores (o carregado dos PNGs); o anterior é descartado */
export function definirTexturaArvores(tex: THREE.DataTexture) {
    if (cacheArvores) cacheArvores.dispose();
    cacheArvores = tex;
}

/**
 * Foto -> mapa de DETALHE do chão. Cada canal é dividido pela sua própria média e a média vai para 0,5: a foto só
 * entra com o que varia (lâminas, folhas, claro e escuro), e a COR continua vindo do bioma, no vértice. O shader
 * multiplica por 2, então 0,5 = neutro. Valores acima de 2x a média são cortados.
 */
export function pixelsDetalheDeFoto(rgba: Uint8ClampedArray): Uint8Array {
    const n = rgba.length / 4;
    const media = [0, 0, 0];
    for (let i = 0; i < n; ++i) for (let c = 0; c < 3; ++c) media[c] += rgba[i * 4 + c];
    for (let c = 0; c < 3; ++c) media[c] = Math.max(media[c] / n, 1);       // 1 (de 255): evita dividir por zero em foto preta
    const out = new Uint8Array(n * 4);
    for (let i = 0; i < n; ++i) {
        for (let c = 0; c < 3; ++c) out[i * 4 + c] = byte(0.5 * rgba[i * 4 + c] / media[c]);
        out[i * 4 + 3] = 255;
    }
    return out;
}

/** a foto de grama de public/texturas/grama.jpg como textura de detalhe; null se o arquivo não existir */
export async function carregarTexturaGrama(): Promise<THREE.DataTexture | null> {
    const minha = geracao;
    const px = await lerPixelsDeImagem('grama.jpg');
    if (!px || minha !== geracao) return null;
    return criarTextura(pixelsDetalheDeFoto(px), TAM_EXTERNA, TAM_EXTERNA);
}

/** troca a textura de grama (a foto carregada); a anterior é descartada */
export function definirTexturaGrama(tex: THREE.DataTexture) {
    if (cacheGrama) cacheGrama.dispose();
    cacheGrama = tex;
}

/** detalhe das superfícies do terreno (rocha, neve, areia, terra): gerado na primeira vez que o estilo PS2 é ligado */
export function texturaSuperficies() {
    if (!cacheSuperficies) cacheSuperficies = criarTextura(pixelsSuperficies());
    return cacheSuperficies;
}

/** desvio do detalhe de cada superfície quando vem de FOTO (R rocha, G neve, B areia, A terra), parecido com o das geradas por código */
const DESVIO_FOTO_SUPERFICIE = [0.12, 0.05, 0.07, 0.11];

const ARQUIVOS_SUPERFICIE = ['rocha.jpg', 'neve.jpg', 'areia.jpg', 'terra.jpg'];   // canais R, G, B, A

/**
 * Procura public/texturas/rocha.jpg, neve.jpg, areia.jpg e terra.jpg. Cada foto que existir vira o detalhe do SEU canal
 * (só a luminosidade que varia, como na grama); as que não existirem ficam com o desenho por código.
 * Devolve null se nenhuma existir.
 */
export async function carregarTexturaSuperficies(): Promise<{ textura: THREE.DataTexture; arquivos: string[] } | null> {
    const minha = geracao;
    const lidos = await Promise.all(ARQUIVOS_SUPERFICIE.map(n => lerPixelsDeImagem(n, TAM)));
    if (minha !== geracao || lidos.every(p => !p)) return null;
    const px = pixelsSuperficies();
    const usados: string[] = [];
    lidos.forEach((foto, c) => {
        if (!foto) return;
        usados.push(ARQUIVOS_SUPERFICIE[c]);
        const n = TAM * TAM;
        const lum = new Float32Array(n);
        let soma = 0;
        for (let i = 0; i < n; ++i) { lum[i] = 0.299 * foto[i * 4] + 0.587 * foto[i * 4 + 1] + 0.114 * foto[i * 4 + 2]; soma += lum[i]; }
        // média -> 0,5 e desvio fixo por superfície: uma foto de contraste alto (folhas claras sobre terra escura) entra com a
        // mesma força das texturas geradas. O shader multiplica duas escalas da mesma textura, então o contraste da foto
        // seria elevado ao quadrado; só dividir pela média (como na grama) estoura em foto assim.
        const media = soma / n;
        let v = 0;
        for (let i = 0; i < n; ++i) v += (lum[i] - media) * (lum[i] - media);
        const dp = Math.sqrt(v / n) || 1;
        const desvio = DESVIO_FOTO_SUPERFICIE[c];
        for (let i = 0; i < n; ++i) px[i * 4 + c] = byte(0.5 + Math.max(-2, Math.min(2, (lum[i] - media) / dp)) * desvio);   // limita a +-2 desvios: folhas muito claras não estouram
    });
    return { textura: criarTextura(px), arquivos: usados };
}

/**
 * A foto terra.jpg COMO ELA É (com a cor): é ela que aparece na terra de outono, em vez de servir de máscara de claro e escuro.
 * Devolve também a cor média (0..1), que o shader usa para tingir de leve com o bioma e para a distância. null se não existir.
 */
export async function carregarTexturaTerra(): Promise<{ textura: THREE.DataTexture; media: [number, number, number] } | null> {
    const minha = geracao;
    const px = await lerPixelsDeImagem('terra.jpg', TAM_EXTERNA);
    if (!px || minha !== geracao) return null;
    const soma = [0, 0, 0], n = px.length / 4;
    for (let i = 0; i < n; ++i) for (let c = 0; c < 3; ++c) soma[c] += px[i * 4 + c];
    const dados = new Uint8Array(n * 4);
    for (let i = 0; i < n * 4; ++i) dados[i] = px[i];
    for (let i = 0; i < n; ++i) dados[i * 4 + 3] = 255;
    return { textura: criarTextura(dados, TAM_EXTERNA, TAM_EXTERNA), media: [soma[0] / n / 255, soma[1] / n / 255, soma[2] / n / 255] };
}

/** troca a textura das superfícies (a carregada de arquivos); a anterior é descartada */
export function definirTexturaSuperficies(tex: THREE.DataTexture) {
    if (cacheSuperficies) cacheSuperficies.dispose();
    cacheSuperficies = tex;
}

/** textura da camada de nuvens do céu (gerada na primeira vez) */
export function texturaNuvensCeu() {
    if (!cacheNuvens) cacheNuvens = criarTextura(pixelsNuvensCeu());
    return cacheNuvens;
}

/** atlas das árvores (gerado na primeira vez) */
export function texturaArvores() {
    if (!cacheArvores) cacheArvores = criarTextura(pixelsArvores(), ARVORE_ATLAS.celulas * ARVORE_ATLAS.largura, ARVORE_ATLAS.altura, false);
    return cacheArvores;
}

export function liberarTexturasPS2() {
    geracao++;
    if (cacheGrama) { cacheGrama.dispose(); cacheGrama = null; }
    if (cacheAsfalto) { cacheAsfalto.dispose(); cacheAsfalto = null; }
    if (cacheArvores) { cacheArvores.dispose(); cacheArvores = null; }
    if (cacheNuvens) { cacheNuvens.dispose(); cacheNuvens = null; }
    if (cacheSuperficies) { cacheSuperficies.dispose(); cacheSuperficies = null; }
}
