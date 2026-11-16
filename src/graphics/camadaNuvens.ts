// camadaNuvens.ts   conta da camada de nuvens do céu no estilo PS2 (sem three: dá para testar sozinha).
//
// As nuvens não são objetos: o shader da cúpula, para cada pixel do céu, acha onde o raio cruza um plano de nuvens a
// `altura` acima da câmera e lê uma textura de ruído ali. Quem calcula o deslocamento dessa textura (vento e posição da
// câmera) é esta função, em dupla precisão no JS: o shader só recebe fract(posição / tile), pequeno, então a camada não
// treme nem "nada" longe da origem.

export interface ParamNuvens {
    nuvens: boolean;
    nuvensQuantidade: number;      // 0..400: vira a cobertura do céu
    nuvensAltura: number;          // altura do plano de nuvens (muda a perspectiva)
    nuvensEscala: number;          // tamanho das nuvens
    nuvensVelocidade: number;      // unidades por segundo
    nuvensDirecao: number;         // graus (0 = +x, 90 = +z)
}

export interface CamadaNuvens {
    ligada: boolean;
    /** cobertura 0..1 (0 = céu limpo, 1 = encoberto) */
    cobertura: number;
    /** altura do plano acima da câmera */
    altura: number;
    /** tamanho de uma repetição da textura nas duas escalas (forma grande e detalhe) */
    tileGrande: number;
    tileFino: number;
    /** fract(posição / tile): [x, z] da escala grande e da fina */
    offGrande: [number, number];
    offFino: [number, number];
}

/** tamanho base (escala 1) de uma repetição da textura: a forma grande e o detalhe */
export const TILE_NUVENS = { grande: 18000, fino: 6000 };

const fr = (v: number) => v - Math.floor(v);

export function calcularCamadaNuvens(c: ParamNuvens, camX: number, camY: number, camZ: number, tempo: number, saida?: CamadaNuvens): CamadaNuvens {
    const s: CamadaNuvens = saida ?? { ligada: false, cobertura: 0, altura: 0, tileGrande: 1, tileFino: 1, offGrande: [0, 0], offFino: [0, 0] };
    const esc = Math.max(0.05, c.nuvensEscala);
    const tg = TILE_NUVENS.grande * esc, tf = TILE_NUVENS.fino * esc;
    const dir = c.nuvensDirecao * Math.PI / 180;
    const vx = Math.cos(dir) * c.nuvensVelocidade * tempo, vz = Math.sin(dir) * c.nuvensVelocidade * tempo;
    // a textura anda com o vento (+v); a posição da câmera entra com sinal oposto à deriva do padrão
    s.ligada = c.nuvens;
    s.cobertura = Math.min(1, Math.max(0, c.nuvensQuantidade / 150));
    s.altura = Math.max(100, c.nuvensAltura - camY);
    s.tileGrande = tg; s.tileFino = tf;
    s.offGrande[0] = fr((camX - vx) / tg); s.offGrande[1] = fr((camZ - vz) / tg);
    s.offFino[0] = fr((camX - vx) / tf); s.offFino[1] = fr((camZ - vz) / tf);
    return s;
}
