// Paleta.ts — cor do terreno e cobertura vegetal por altitude, inclinação e bioma.
//
// Tudo é calculado por VÉRTICE da grade do terreno e interpolado pela GPU (cor por vértice), então não custa nada
// na hora de desenhar. O bioma é um ruído de baixa frequência que desliza a cor do solo entre verde, oliva,
// dourado, outono, savana e deserto; a altitude e a inclinação levam o solo à rocha e à neve.
// A mesma função diz quanto de árvore e de grama cada ponto aceita (nada de árvore no deserto, na rocha ou na neve).

export interface ParamPaleta {
    /** false = terreno de uma cor só, como antes (e vegetação em toda parte) */
    ativa: boolean;
    escalaBioma: number;
    altitudeRocha: number;
    altitudeNeve: number;
    inclinacaoRocha: number;
    variacaoCor: number;
}

/** cor única do terreno quando a paleta está desligada (a cor "verde" original do jogo) */
export const COR_GRAMA_PADRAO = [0.34, 0.7, 0.56];

/** resultado de avaliarPaleta (reaproveitado, para não alocar por vértice) */
export interface SaidaPaleta {
    r: number; g: number; b: number; arvore: number; grama: number;
    /** pesos 0..1 de "que superfície é esta" (somam no máximo 1; o resto é solo comum). Usados pelas partículas do carro */
    neve: number; rocha: number; deserto: number; outono: number;
}

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const suave = (a: number, b: number, x: number) => { const t = limitar((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** cor do solo coberto de vegetação por bioma: [posição no ruído de bioma 0..1, r, g, b] */
// (o ruído de bioma se distribui assim: ~21% abaixo de 0.3, 30% entre 0.3 e 0.5, 28% entre 0.5 e 0.7, 21% acima)
const RAMPA_BIOMA = [
    [0.00, 0.34, 0.70, 0.56],   // verde (a cor original do jogo): fica puro até 0.30
    [0.30, 0.34, 0.70, 0.56],
    [0.42, 0.50, 0.72, 0.42],   // oliva
    [0.50, 0.70, 0.68, 0.38],   // campo dourado
    [0.60, 0.80, 0.52, 0.26],   // outono
    [0.72, 0.82, 0.66, 0.40],   // savana
    [0.84, 0.90, 0.77, 0.54],   // deserto
    [1.00, 0.90, 0.77, 0.54],
];
const ROCHA = [0.50, 0.49, 0.50];
const ROCHA_DESERTO = [0.74, 0.52, 0.36];      // arenito
const NEVE = [0.95, 0.97, 1.0];

/**
 * @param bioma  0..1 (ruído de bioma, já com contraste)
 * @param alt    altitude relativa 0..1 (altura / altura máxima do relevo)
 * @param incl   inclinação (tangente: 0 = plano, 1 = 45°)
 * @param ruido  variação de cor em [-1, 1] (por vértice)
 */
export function avaliarPaleta(p: ParamPaleta, bioma: number, alt: number, incl: number, ruido: number, s: SaidaPaleta) {
    if (!p.ativa) {
        s.r = COR_GRAMA_PADRAO[0]; s.g = COR_GRAMA_PADRAO[1]; s.b = COR_GRAMA_PADRAO[2];
        s.arvore = 1; s.grama = 1;
        s.neve = 0; s.rocha = 0; s.deserto = 0; s.outono = 0;
        return;
    }

    // solo por bioma
    let k = 1;
    while (k < RAMPA_BIOMA.length - 1 && RAMPA_BIOMA[k][0] < bioma) ++k;
    const a = RAMPA_BIOMA[k - 1], b = RAMPA_BIOMA[k];
    const u = limitar((bioma - a[0]) / (b[0] - a[0] || 1), 0, 1);
    const sr = a[1] + (b[1] - a[1]) * u, sg = a[2] + (b[2] - a[2]) * u, sb = a[3] + (b[3] - a[3]) * u;

    // rocha: nas encostas íngremes e nas altitudes altas (arenito vermelho no deserto)
    const des = suave(0.7, 0.9, bioma);
    const rr = ROCHA[0] + (ROCHA_DESERTO[0] - ROCHA[0]) * des;
    const rg = ROCHA[1] + (ROCHA_DESERTO[1] - ROCHA[1]) * des;
    const rb = ROCHA[2] + (ROCHA_DESERTO[2] - ROCHA[2]) * des;
    const rochaInc = suave(p.inclinacaoRocha, p.inclinacaoRocha + 0.35, incl);
    const rochaAlt = suave(p.altitudeRocha, p.altitudeRocha + 0.12, alt);
    const fRocha = Math.max(rochaInc, rochaAlt);

    // neve: no alto, e agarra menos nas encostas íngremes
    const fNeve = suave(p.altitudeNeve, p.altitudeNeve + 0.06, alt) * (1 - 0.6 * rochaInc);

    let r = sr + (rr - sr) * fRocha, g = sg + (rg - sg) * fRocha, bl = sb + (rb - sb) * fRocha;
    r += (NEVE[0] - r) * fNeve; g += (NEVE[1] - g) * fNeve; bl += (NEVE[2] - bl) * fNeve;

    // variação de brilho (a neve é mais lisa)
    const v = 1 + ruido * p.variacaoCor * (1 - 0.6 * fNeve);
    s.r = limitar(r * v, 0, 1); s.g = limitar(g * v, 0, 1); s.b = limitar(bl * v, 0, 1);

    // cobertura vegetal: o bioma tira as árvores do deserto e da savana seca; a altitude e a inclinação, de todos
    const fInc = 1 - suave(p.inclinacaoRocha * 0.7, p.inclinacaoRocha + 0.1, incl);
    const fAltArvore = 1 - suave(p.altitudeRocha - 0.05, p.altitudeRocha + 0.07, alt);
    const fAltGrama = 1 - suave(p.altitudeRocha, p.altitudeRocha + 0.12, alt);
    s.arvore = (1 - 0.9 * suave(0.6, 0.84, bioma)) * (1 - suave(0.84, 0.92, bioma)) * fAltArvore * fInc;
    s.grama = (1 - 0.85 * suave(0.68, 0.88, bioma)) * fAltGrama * fInc;

    // pesos de superfície: a neve e a rocha vêm direto dos fatores acima; deserto e outono são faixas do ruído de bioma
    // (a mesma região da rampa de cores), e só valem onde não há rocha nem neve por cima
    const cobertura = (1 - fRocha) * (1 - fNeve);
    s.neve = fNeve;
    s.rocha = fRocha * (1 - fNeve);
    s.deserto = suave(0.68, 0.80, bioma) * cobertura;
    s.outono = suave(0.50, 0.58, bioma) * (1 - suave(0.64, 0.72, bioma)) * cobertura;
}
