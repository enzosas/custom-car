// painelCampos.ts   GERADO a partir das macros de Config.h (gerarAbasAutomaticas).
// fator = divisor de exibi o (REGISTRAR_CAMPO=1, _ESCALA=15, _VELOCIDADE=0.25, _ACELERACAO=0.004).

export interface CampoDef {
    nome: string; tipo: 'float' | 'uint'; fator: number;
    /** passo fixo por pixel de arrasto (shift = 10x). Sem isso, o passo é proporcional ao valor atual. */
    passo?: number;
    min?: number; max?: number;
    /** matiz: ao passar de `max` volta para `min` */
    ciclico?: boolean;
}

/** linha liga/desliga: `nome`   uma chave booleana do objeto em `caminho` (escrita  o; n o vem do gerador) */
export interface InterruptorDef { nome: string; rotulo: string }

/** chaves (H, S, V) de um grupo de cor HSV do objeto da seção; o painel mostra uma amostra da cor */
export interface AmostraHSV { h: string; s: string; v: string }

export interface SecaoDef { titulo: string; caminho: string[]; campos: CampoDef[]; interruptores?: InterruptorDef[]; amostra?: AmostraHSV }
export interface AbaDef { titulo: string; secoes: SecaoDef[] }

// ---- cores em HSV (luz config) ----
// H em graus (0-360, dá a volta), S e V de 0 a 1. `prefixo` + H/S/V são as chaves em GAME_CONFIG.luz.parametros.
const camposHSV = (p: string): CampoDef[] => [
  { nome: `${p}H`, tipo: 'float', fator: 1.0, passo: 0.5, min: 0, max: 360, ciclico: true },
  { nome: `${p}S`, tipo: 'float', fator: 1.0, passo: 0.003, min: 0, max: 1 },
  { nome: `${p}V`, tipo: 'float', fator: 1.0, passo: 0.003, min: 0, max: 1 },
];
const secaoCor = (titulo: string, p: string, extras: CampoDef[] = []): SecaoDef => ({
  titulo, caminho: ['luz', 'parametros'], campos: [...camposHSV(p), ...extras],
  amostra: { h: `${p}H`, s: `${p}S`, v: `${p}V` },
});

export const ABAS: AbaDef[] = [
  {
    titulo: 'carro config 1', secoes: [
      { titulo: 'dimensoes', caminho: ['carro', 'dimensoes'], campos: [{ nome: 'largura', tipo: 'float', fator: 15.0 }, { nome: 'comprimento', tipo: 'float', fator: 15.0 }, { nome: 'alturachao', tipo: 'float', fator: 15.0 }, { nome: 'alturaporta', tipo: 'float', fator: 15.0 }, { nome: 'alturaparabrisa', tipo: 'float', fator: 15.0 }, { nome: 'comprimentorodas', tipo: 'float', fator: 15.0 }, { nome: 'largurarodas', tipo: 'float', fator: 15.0 }, { nome: 'offsetchassi', tipo: 'float', fator: 15.0 }, { nome: 'taxaBaseCockpitTras', tipo: 'float', fator: 1.0 }, { nome: 'taxaTopoCockpitTras', tipo: 'float', fator: 1.0 }, { nome: 'taxaTopoCockpitFrente', tipo: 'float', fator: 1.0 }, { nome: 'taxaBaseCockpitFrente', tipo: 'float', fator: 1.0 }] },
      { titulo: 'rodas', caminho: ['carro', 'rodas'], campos: [{ nome: 'raio', tipo: 'float', fator: 15.0 }, { nome: 'largura', tipo: 'float', fator: 15.0 }, { nome: 'segmentos', tipo: 'uint', fator: 1.0 }] },
      { titulo: 'opcoes', caminho: ['opcoes'], campos: [], interruptores: [{ nome: 'rodasVisiveis', rotulo: 'mostrar rodas' }] },
    ]
  },
  {
    titulo: 'carro config 2', secoes: [
      { titulo: 'fisica', caminho: ['carro', 'fisica'], campos: [{ nome: 'aceleracao', tipo: 'float', fator: 0.004 }, { nome: 'aceleracaoFreio', tipo: 'float', fator: 0.004 }, { nome: 'velmax', tipo: 'float', fator: 0.25 }, { nome: 'velmaxre', tipo: 'float', fator: 0.25 }, { nome: 'anguloVolanteMax', tipo: 'float', fator: 1.0 }, { nome: 'velocidadeGiro', tipo: 'float', fator: 1.0 }, { nome: 'taxaLerpVolante', tipo: 'float', fator: 1.0 }, { nome: 'aderenciaFreioDeMao', tipo: 'float', fator: 1.0 }, { nome: 'aderenciaPista', tipo: 'float', fator: 1.0 }, { nome: 'atritoEscalar', tipo: 'float', fator: 1.0 }, { nome: 'atritoLinear', tipo: 'float', fator: 1.0 }, { nome: 'arrastoQuadratico', tipo: 'float', fator: 1.0 }, { nome: 'suspensaoRigidez', tipo: 'float', fator: 1.0 }, { nome: 'suspensaoAmortecimento', tipo: 'float', fator: 1.0 }, { nome: 'suspensaoInclinacaoMax', tipo: 'float', fator: 1.0 }, { nome: 'velReferenciaGiro', tipo: 'float', fator: 0.25 }, { nome: 'taxaRecuperacaoGrip', tipo: 'float', fator: 1.0 }, { nome: 'forcaPulo', tipo: 'float', fator: 15.0 }, { nome: 'gravidade', tipo: 'float', fator: 15.0 }, { nome: 'fatorPuloMinimo', tipo: 'float', fator: 1.0 }, { nome: 'tempoCargaPulo', tipo: 'float', fator: 1.0 }, { nome: 'compressaoPulo', tipo: 'float', fator: 15.0 }, { nome: 'reacaoPouso', tipo: 'float', fator: 1.0 }, { nome: 'limiarDecolagem', tipo: 'float', fator: 15.0 }, { nome: 'limiarDriftRastro', tipo: 'float', fator: 0.25 }] },
    ]
  },
  {
    titulo: 'camera config', secoes: [
      { titulo: 'parametros', caminho: ['camera', 'parametros'], campos: [{ nome: 'distanciaRaioBase', tipo: 'float', fator: 15.0 }, { nome: 'pitchPadrao', tipo: 'float', fator: 1.0 }, { nome: 'suavizacaoPos', tipo: 'float', fator: 1.0 }, { nome: 'suavizacaoTarget', tipo: 'float', fator: 1.0 }, { nome: 'taxaRetornoOrbita', tipo: 'float', fator: 1.0 }, { nome: 'sensibilidadeMouse', tipo: 'float', fator: 1.0 }, { nome: 'offsetX', tipo: 'float', fator: 15.0 }, { nome: 'offsetY', tipo: 'float', fator: 15.0 }, { nome: 'offsetZ', tipo: 'float', fator: 15.0 }] },
    ]
  },
  {
    titulo: 'terreno config', secoes: [
      { titulo: 'parametros', caminho: ['terreno', 'parametros'], campos: [{ nome: 'espacamento', tipo: 'float', fator: 15.0 }, { nome: 'ondulacao', tipo: 'float', fator: 15.0 }, { nome: 'comprimentoOnda', tipo: 'float', fator: 1.0 }, { nome: 'oitavas', tipo: 'uint', fator: 1.0 }, { nome: 'persistencia', tipo: 'float', fator: 1.0, passo: 0.005, min: 0, max: 1 }, { nome: 'raioChunks', tipo: 'uint', fator: 1.0 }] },
      { titulo: 'superficie', caminho: ['terreno', 'superficie'], campos: [{ nome: 'offsetprofundidadegrama', tipo: 'float', fator: 15.0 }] },
      { titulo: 'visualizacao', caminho: ['terreno', 'visualizacao'], campos: [{ nome: 'fatorOpacidade', tipo: 'float', fator: 1.0 }] },
    ]
  },
  {
    titulo: 'arvore config', secoes: [
      { titulo: 'arvores', caminho: ['arvore', 'arvores'], campos: [{ nome: 'quantidade', tipo: 'uint', fator: 1.0 }, { nome: 'alturaTronco', tipo: 'float', fator: 15.0 }, { nome: 'alturaTroncoRand', tipo: 'float', fator: 1.0 }, { nome: 'raioTronco', tipo: 'float', fator: 15.0 }, { nome: 'raioTroncoRand', tipo: 'float', fator: 1.0 }, { nome: 'anguloRandMax', tipo: 'float', fator: 1.0 }, { nome: 'inclinacaoRandMax', tipo: 'float', fator: 1.0 }, { nome: 'afundamentoBase', tipo: 'float', fator: 15.0 }, { nome: 'segmentosTronco', tipo: 'uint', fator: 1.0 }, { nome: 'distanciaEstrada', tipo: 'float', fator: 15.0 }] },
    ]
  },
  {
    titulo: 'grama config', secoes: [
      { titulo: 'grama', caminho: ['grama', 'grama'], campos: [{ nome: 'quantidade', tipo: 'uint', fator: 1.0 }, { nome: 'altura', tipo: 'float', fator: 15.0 }, { nome: 'raio', tipo: 'float', fator: 15.0 }, { nome: 'segmentos', tipo: 'uint', fator: 1.0 }, { nome: 'distanciaEstrada', tipo: 'float', fator: 15.0 }] },
    ]
  },
  {
    titulo: 'estrada config', secoes: [
      { titulo: 'estrada', caminho: ['estrada', 'estrada'], campos: [{ nome: 'largura', tipo: 'float', fator: 15.0 }, { nome: 'anguloCurva', tipo: 'float', fator: 1.0, passo: 0.25, min: 0, max: 90 }, { nome: 'comprimentoCurva', tipo: 'float', fator: 1.0 }, { nome: 'larguraTransicao', tipo: 'float', fator: 1.0 }] },
    ]
  },
  {
    titulo: 'luz config', secoes: [
      { titulo: 'sol (direcao)', caminho: ['luz', 'parametros'], campos: [{ nome: 'dirX', tipo: 'float', fator: 1.0 }, { nome: 'dirY', tipo: 'float', fator: 1.0 }, { nome: 'dirZ', tipo: 'float', fator: 1.0 }] },
      secaoCor('sol (cor)', 'cor'),
      secaoCor('ceu (fundo e neblina)', 'ceu', [{ nome: 'neblina', tipo: 'float', fator: 1.0, passo: 0.005, min: 0, max: 1 }]),
      secaoCor('ambiente', 'ambiente'),
      { titulo: 'intensidades', caminho: ['luz', 'parametros'], campos: [{ nome: 'intensidadeAmbiente', tipo: 'float', fator: 1.0 }, { nome: 'intensidadeDifusa', tipo: 'float', fator: 1.0 }, { nome: 'intensidadeEspecular', tipo: 'float', fator: 1.0 }, { nome: 'shininess', tipo: 'float', fator: 1.0 }] },
    ]
  },
  {
    titulo: 'piloto config', secoes: [
      { titulo: 'parametros', caminho: ['pilotoAutomatico', 'parametros'], campos: [{ nome: 'lookaheadBase', tipo: 'float', fator: 1.0 }, { nome: 'lookaheadVel', tipo: 'float', fator: 1.0 }, { nome: 'lookaheadForaPista', tipo: 'float', fator: 15.0 }, { nome: 'kLead', tipo: 'float', fator: 1.0 }, { nome: 'kYaw', tipo: 'float', fator: 0.004 }, { nome: 'fatorVelCurva', tipo: 'float', fator: 1.0 }, { nome: 'fatorFreio', tipo: 'float', fator: 1.0 }, { nome: 'velMinCurva', tipo: 'float', fator: 1.0 }, { nome: 'fatorLinha', tipo: 'float', fator: 1.0 }, { nome: 'margemLinha', tipo: 'float', fator: 15.0 }, { nome: 'raioRefLinha', tipo: 'float', fator: 15.0 }] },
    ]
  },
];