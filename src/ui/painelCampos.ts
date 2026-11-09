// painelCampos.ts   GERADO a partir das macros de Config.h (gerarAbasAutomaticas).
export interface CampoDef {
  nome: string;
  tipo: 'float' | 'uint';
  min?: number;
  max?: number;
  /** matiz: ao passar de max volta para min */
  ciclico?: boolean;
}

export interface InterruptorDef { nome: string; rotulo: string }

export interface AmostraHSV { h: string; s: string; v: string }

export interface SecaoDef {
  titulo: string;
  caminho: string[];
  campos: CampoDef[];
  interruptores?: InterruptorDef[];
  amostra?: AmostraHSV
}

export interface AbaDef { titulo: string; secoes: SecaoDef[] }

// ---- cores em HSV (luz config) ----
const camposHSV = (p: string): CampoDef[] => [
  { nome: `${p}H`, tipo: 'float', min: 0, max: 360, ciclico: true },
  { nome: `${p}S`, tipo: 'float', min: 0, max: 1 },
  { nome: `${p}V`, tipo: 'float', min: 0, max: 1 },
];

const secaoCor = (titulo: string, p: string, extras: CampoDef[] = []): SecaoDef => ({
  titulo, caminho: ['luz', 'parametros'], campos: [...camposHSV(p), ...extras],
  amostra: { h: `${p}H`, s: `${p}S`, v: `${p}V` },
});

export const ABAS: AbaDef[] = [
  {
    titulo: 'carro config 1', secoes: [
      { titulo: 'dimensoes', caminho: ['carro', 'dimensoes'], campos: [{ nome: 'largura', tipo: 'float' }, { nome: 'comprimento', tipo: 'float' }, { nome: 'alturachao', tipo: 'float' }, { nome: 'alturaporta', tipo: 'float' }, { nome: 'alturaparabrisa', tipo: 'float' }, { nome: 'comprimentorodas', tipo: 'float' }, { nome: 'largurarodas', tipo: 'float' }, { nome: 'offsetchassi', tipo: 'float' }, { nome: 'taxaBaseCockpitTras', tipo: 'float' }, { nome: 'taxaTopoCockpitTras', tipo: 'float' }, { nome: 'taxaTopoCockpitFrente', tipo: 'float' }, { nome: 'taxaBaseCockpitFrente', tipo: 'float' }] },
      { titulo: 'rodas', caminho: ['carro', 'rodas'], campos: [{ nome: 'raio', tipo: 'float' }, { nome: 'largura', tipo: 'float' }, { nome: 'segmentos', tipo: 'uint' }] },
      { titulo: 'opcoes', caminho: ['opcoes'], campos: [], interruptores: [{ nome: 'rodasVisiveis', rotulo: 'mostrar rodas' }] },
    ]
  },
  {
    titulo: 'carro config 2', secoes: [
      { titulo: 'fisica', caminho: ['carro', 'fisica'], campos: [{ nome: 'aceleracao', tipo: 'float' }, { nome: 'aceleracaoFreio', tipo: 'float' }, { nome: 'velmax', tipo: 'float' }, { nome: 'velmaxre', tipo: 'float' }, { nome: 'anguloVolanteMax', tipo: 'float' }, { nome: 'velocidadeGiro', tipo: 'float' }, { nome: 'taxaLerpVolante', tipo: 'float' }, { nome: 'aderenciaFreioDeMao', tipo: 'float' }, { nome: 'aderenciaPista', tipo: 'float' }, { nome: 'atritoEscalar', tipo: 'float' }, { nome: 'atritoLinear', tipo: 'float' }, { nome: 'arrastoQuadratico', tipo: 'float' }, { nome: 'suspensaoRigidez', tipo: 'float' }, { nome: 'suspensaoAmortecimento', tipo: 'float' }, { nome: 'suspensaoInclinacaoMax', tipo: 'float' }, { nome: 'velReferenciaGiro', tipo: 'float' }, { nome: 'taxaRecuperacaoGrip', tipo: 'float' }, { nome: 'forcaPulo', tipo: 'float' }, { nome: 'gravidade', tipo: 'float' }, { nome: 'fatorPuloMinimo', tipo: 'float' }, { nome: 'tempoCargaPulo', tipo: 'float' }, { nome: 'compressaoPulo', tipo: 'float' }, { nome: 'reacaoPouso', tipo: 'float' }, { nome: 'limiarDecolagem', tipo: 'float' }, { nome: 'limiarDriftRastro', tipo: 'float' }] },
    ]
  },
  {
    titulo: 'camera config', secoes: [
      { titulo: 'parametros', caminho: ['camera', 'parametros'], campos: [{ nome: 'distanciaRaioBase', tipo: 'float' }, { nome: 'pitchPadrao', tipo: 'float' }, { nome: 'suavizacaoPos', tipo: 'float' }, { nome: 'suavizacaoTarget', tipo: 'float' }, { nome: 'taxaRetornoOrbita', tipo: 'float' }, { nome: 'sensibilidadeMouse', tipo: 'float' }, { nome: 'offsetX', tipo: 'float' }, { nome: 'offsetY', tipo: 'float' }, { nome: 'offsetZ', tipo: 'float' }] },
    ]
  },
  {
    titulo: 'terreno config', secoes: [
      { titulo: 'parametros', caminho: ['terreno', 'parametros'], campos: [{ nome: 'ptcontrole', tipo: 'uint' }, { nome: 'subdivisoes', tipo: 'uint' }, { nome: 'espacamento', tipo: 'float' }, { nome: 'ondulacao', tipo: 'float' }, { nome: 'fatorborda', tipo: 'float' }] },
      { titulo: 'superficie', caminho: ['terreno', 'superficie'], campos: [{ nome: 'offsetprofundidadegrama', tipo: 'float' }] },
      { titulo: 'visualizacao', caminho: ['terreno', 'visualizacao'], campos: [{ nome: 'fatorOpacidade', tipo: 'float' }] },
    ]
  },
  {
    titulo: 'arvore config', secoes: [
      { titulo: 'arvores', caminho: ['arvore', 'arvores'], campos: [{ nome: 'quantidade', tipo: 'uint' }, { nome: 'alturaTronco', tipo: 'float' }, { nome: 'alturaTroncoRand', tipo: 'float' }, { nome: 'raioTronco', tipo: 'float' }, { nome: 'raioTroncoRand', tipo: 'float' }, { nome: 'anguloRandMax', tipo: 'float' }, { nome: 'inclinacaoRandMax', tipo: 'float' }, { nome: 'afundamentoBase', tipo: 'float' }, { nome: 'segmentosTronco', tipo: 'uint' }, { nome: 'distanciaEstrada', tipo: 'float' }] },
    ]
  },
  {
    titulo: 'grama config', secoes: [
      { titulo: 'grama', caminho: ['grama', 'grama'], campos: [{ nome: 'quantidade', tipo: 'uint' }, { nome: 'altura', tipo: 'float' }, { nome: 'raio', tipo: 'float' }, { nome: 'segmentos', tipo: 'uint' }, { nome: 'distanciaEstrada', tipo: 'float' }] },
    ]
  },
  {
    titulo: 'estrada config', secoes: [
      { titulo: 'estrada', caminho: ['estrada', 'estrada'], campos: [{ nome: 'largura', tipo: 'float' }, { nome: 'quantidadePontosControle', tipo: 'uint' }, { nome: 'raioBase', tipo: 'float' }, { nome: 'quantidadeRuido', tipo: 'float' }, { nome: 'offsetElevacao', tipo: 'float' }] },
    ]
  },
  {
    titulo: 'luz config', secoes: [
      { titulo: 'sol (direcao)', caminho: ['luz', 'parametros'], campos: [{ nome: 'dirX', tipo: 'float' }, { nome: 'dirY', tipo: 'float' }, { nome: 'dirZ', tipo: 'float' }] },
      secaoCor('sol (cor)', 'cor'),
      secaoCor('ceu (fundo e neblina)', 'ceu', [{ nome: 'neblina', tipo: 'float', min: 0, max: 1 }]),
      secaoCor('ambiente', 'ambiente'),
      { titulo: 'intensidades', caminho: ['luz', 'parametros'], campos: [{ nome: 'intensidadeAmbiente', tipo: 'float' }, { nome: 'intensidadeDifusa', tipo: 'float' }, { nome: 'intensidadeEspecular', tipo: 'float' }, { nome: 'shininess', tipo: 'float' }] },
    ]
  },
  {
    titulo: 'piloto config', secoes: [
      { titulo: 'parametros', caminho: ['pilotoAutomatico', 'parametros'], campos: [{ nome: 'lookaheadBase', tipo: 'float' }, { nome: 'lookaheadVel', tipo: 'float' }, { nome: 'lookaheadForaPista', tipo: 'float' }, { nome: 'kLead', tipo: 'float' }, { nome: 'kYaw', tipo: 'float' }, { nome: 'fatorVelCurva', tipo: 'float' }, { nome: 'fatorFreio', tipo: 'float' }, { nome: 'velMinCurva', tipo: 'float' }, { nome: 'fatorLinha', tipo: 'float' }, { nome: 'margemLinha', tipo: 'float' }, { nome: 'raioRefLinha', tipo: 'float' }] },
    ]
  },
];