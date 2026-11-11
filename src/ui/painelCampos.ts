// painelCampos.ts — descrição das abas, seções e campos do painel de config.
//
// Cada campo tem:
//   nome         chave real dentro do GAME_CONFIG (não mudar sem mudar o config);
//   apresentacao texto mostrado no painel (se faltar, aparece o próprio `nome`);
//   tipo         'float' ou 'uint';
//   min / max    limites opcionais (com os dois, 300 px de arrasto percorrem a faixa inteira);
//   ciclico      matiz: ao passar de max volta para min.
//
// Cada seção pode ter `aplicarAoSoltar: true`: enquanto o campo é arrastado o valor mostrado muda, mas o
// GAME_CONFIG (e portanto o jogo) só é atualizado ao soltar. Usado nas seções que reconstroem o terreno.
export interface CampoDef {
  nome: string;
  apresentacao?: string;
  tipo: 'float' | 'uint';
  min?: number;
  max?: number;
  /** matiz: ao passar de max volta para min */
  ciclico?: boolean;
}

export interface InterruptorDef { nome: string; rotulo: string }

/** ações que um botão do painel pode disparar (implementadas em ConfigPanel, via AcoesPainel) */
export type AcaoPainel = 'novaSeed';

export interface BotaoDef {
  /** texto do botão */
  rotulo: string;
  /** o que acontece ao clicar */
  acao: AcaoPainel;
  /** linha de informação, em cinza, acima do botão (mostra o valor atual relacionado à ação) */
  info?: 'seed';
}

export interface AmostraHSV { h: string; s: string; v: string }

export interface SecaoDef {
  titulo: string;
  caminho: string[];
  campos: CampoDef[];
  interruptores?: InterruptorDef[];
  botoes?: BotaoDef[];
  amostra?: AmostraHSV;
  /** o jogo só recebe o novo valor quando o arrasto termina (para ajustes caros, como reconstruir o terreno) */
  aplicarAoSoltar?: boolean;
}

export interface AbaDef { titulo: string; secoes: SecaoDef[] }

// ---- cores em HSV (ceu config) ----
const camposHSV = (p: string): CampoDef[] => [
  { nome: `${p}H`, apresentacao: 'matiz', tipo: 'float', min: 0, max: 360, ciclico: true },
  { nome: `${p}S`, apresentacao: 'saturacao', tipo: 'float', min: 0, max: 1 },
  { nome: `${p}V`, apresentacao: 'valor (brilho)', tipo: 'float', min: 0, max: 1 },
];

const secaoCor = (titulo: string, p: string, extras: CampoDef[] = [], caminho: string[] = ['luz', 'parametros']): SecaoDef => ({
  titulo, caminho, campos: [...camposHSV(p), ...extras],
  amostra: { h: `${p}H`, s: `${p}S`, v: `${p}V` },
});

export const ABAS: AbaDef[] = [
  {
    titulo: 'carro config 1', secoes: [
      {
        titulo: 'dimensoes', caminho: ['carro', 'dimensoes'], campos: [
          { nome: 'largura', apresentacao: 'largura', tipo: 'float' },
          { nome: 'comprimento', apresentacao: 'comprimento', tipo: 'float' },
          { nome: 'alturachao', apresentacao: 'altura do chao', tipo: 'float' },
          { nome: 'alturaporta', apresentacao: 'altura da porta', tipo: 'float' },
          { nome: 'alturaparabrisa', apresentacao: 'altura do parabrisa', tipo: 'float' },
          { nome: 'comprimentorodas', apresentacao: 'distancia entre eixos', tipo: 'float' },
          { nome: 'largurarodas', apresentacao: 'distancia entre rodas', tipo: 'float' },
          { nome: 'offsetchassi', apresentacao: 'offset chassi', tipo: 'float' },
          { nome: 'taxaBaseCockpitTras', apresentacao: 'cockpit base traseira', tipo: 'float' },
          { nome: 'taxaTopoCockpitTras', apresentacao: 'cockpit topo traseira', tipo: 'float' },
          { nome: 'taxaTopoCockpitFrente', apresentacao: 'cockpit topo frente', tipo: 'float' },
          { nome: 'taxaBaseCockpitFrente', apresentacao: 'cockpit base frente', tipo: 'float' },
        ]
      },
      {
        titulo: 'rodas', caminho: ['carro', 'rodas'], campos: [
          { nome: 'raio', apresentacao: 'raio', tipo: 'float' },
          { nome: 'largura', apresentacao: 'largura', tipo: 'float' },
          { nome: 'segmentos', apresentacao: 'segmentos', tipo: 'uint' },
        ]
      },
      { titulo: 'opcoes', caminho: ['opcoes'], campos: [], interruptores: [{ nome: 'rodasVisiveis', rotulo: 'mostrar rodas' }] },
    ]
  },
  {
    titulo: 'carro config 2', secoes: [
      {
        titulo: 'fisica', caminho: ['carro', 'fisica'], campos: [
          { nome: 'aceleracao', apresentacao: 'aceleracao', tipo: 'float' },
          { nome: 'aceleracaoFreio', apresentacao: 'aceleracao do freio', tipo: 'float' },
          { nome: 'velmax', apresentacao: 'velocidade maxima', tipo: 'float' },
          { nome: 'velmaxre', apresentacao: 'velocidade maxima de re', tipo: 'float' },
          { nome: 'velocidadeGiro', apresentacao: 'velocidade giro', tipo: 'float' },
          { nome: 'taxaLerpVolante', apresentacao: 'suavizacao volante', tipo: 'float' },
          { nome: 'aderenciaFreioDeMao', apresentacao: 'aderencia freio de mao', tipo: 'float' },
          { nome: 'aderenciaPista', apresentacao: 'aderencia da pista', tipo: 'float' },
          { nome: 'atritoEscalar', apresentacao: 'atrito escalar', tipo: 'float' },
          { nome: 'atritoLinear', apresentacao: 'atrito linear', tipo: 'float' },
          { nome: 'suspensaoRigidez', apresentacao: 'rigidez da suspensao', tipo: 'float' },
          { nome: 'suspensaoAmortecimento', apresentacao: 'amortecimento da suspensao', tipo: 'float' },
          { nome: 'suspensaoInclinacaoMax', apresentacao: 'inclinacao maxima da suspensao', tipo: 'float' },
          { nome: 'velReferenciaGiro', apresentacao: 'velocidade de referencia do giro', tipo: 'float' },
          { nome: 'taxaRecuperacaoGrip', apresentacao: 'recuperacao da aderencia', tipo: 'float' },
          { nome: 'forcaPulo', apresentacao: 'forca do pulo', tipo: 'float' },
          { nome: 'gravidade', apresentacao: 'gravidade', tipo: 'float' },
          { nome: 'fatorPuloMinimo', apresentacao: 'pulo minimo', tipo: 'float' },
          { nome: 'tempoCargaPulo', apresentacao: 'tempo de carga do pulo', tipo: 'float' },
          { nome: 'compressaoPulo', apresentacao: 'compressao do pulo', tipo: 'float' },
          { nome: 'reacaoPouso', apresentacao: 'reacao ao pouso', tipo: 'float' },
          { nome: 'reacaoTerrenoAngular', apresentacao: 'reacao ao relevo (inclinacao)', tipo: 'float' },
          { nome: 'reacaoTerrenoVertical', apresentacao: 'reacao ao relevo (vertical)', tipo: 'float' },
          { nome: 'limiarDecolagem', apresentacao: 'limiar de decolagem', tipo: 'float' },
          { nome: 'limiarDriftRastro', apresentacao: 'limiar do rastro de drift', tipo: 'float' },
        ]
      },
    ]
  },
  {
    titulo: 'camera config', secoes: [
      {
        titulo: 'parametros', caminho: ['camera', 'parametros'], campos: [
          { nome: 'distanciaRaioBase', apresentacao: 'distancia', tipo: 'float' },
          { nome: 'pitchPadrao', apresentacao: 'inclinacao padrao (pitch)', tipo: 'float' },
          { nome: 'suavizacaoPos', apresentacao: 'suavizacao da posicao', tipo: 'float' },
          { nome: 'suavizacaoTarget', apresentacao: 'suavizacao do alvo', tipo: 'float' },
          { nome: 'taxaRetornoOrbita', apresentacao: 'retorno da orbita', tipo: 'float' },
          { nome: 'sensibilidadeMouse', apresentacao: 'sensibilidade do mouse', tipo: 'float' },
          { nome: 'offsetX', apresentacao: 'offset x', tipo: 'float' },
          { nome: 'offsetY', apresentacao: 'offset y', tipo: 'float' },
          { nome: 'offsetZ', apresentacao: 'offset z', tipo: 'float' },
          { nome: 'offsetYaw', apresentacao: 'offset yaw (graus)', tipo: 'float' },
          { nome: 'offsetRoll', apresentacao: 'offset roll (graus)', tipo: 'float' },
        ]
      },
    ]
  },
  {
    titulo: 'terreno config', secoes: [
      {
        titulo: 'seed', caminho: ['terreno', 'parametros'], campos: [],
        botoes: [{ rotulo: 'nova seed', acao: 'novaSeed', info: 'seed' }],
      },
      {
        titulo: 'parametros', caminho: ['terreno', 'parametros'], aplicarAoSoltar: true, campos: [
          { nome: 'espacamento', apresentacao: 'espacamento', tipo: 'float' },
          { nome: 'ondulacao', apresentacao: 'ondulacao (altura)', tipo: 'float' },
          { nome: 'comprimentoOnda', apresentacao: 'comprimento da onda', tipo: 'float' },
          { nome: 'oitavas', apresentacao: 'oitavas', tipo: 'uint', min: 1, max: 8 },
          { nome: 'persistencia', apresentacao: 'persistencia', tipo: 'float', min: 0, max: 1 },
          { nome: 'celulasPorChunk', apresentacao: 'celulas por chunk', tipo: 'uint', min: 4, max: 250 },
          { nome: 'raioChunks', apresentacao: 'raio de chunks', tipo: 'uint', min: 1, max: 12 },
        ]
      },
      {
        titulo: 'paleta (cor por bioma, altitude e inclinacao)', caminho: ['terreno', 'paleta'], aplicarAoSoltar: true, campos: [
          { nome: 'escalaBioma', apresentacao: 'tamanho dos biomas', tipo: 'float' },
          { nome: 'altitudeRocha', apresentacao: 'altitude da rocha', tipo: 'float', min: 0, max: 1 },
          { nome: 'altitudeNeve', apresentacao: 'altitude da neve', tipo: 'float', min: 0, max: 1 },
          { nome: 'inclinacaoRocha', apresentacao: 'inclinacao da rocha', tipo: 'float', min: 0, max: 1.5 },
          { nome: 'variacaoCor', apresentacao: 'variacao de cor', tipo: 'float', min: 0, max: 0.3 },
        ],
        interruptores: [{ nome: 'ativa', rotulo: 'paleta ligada' }],
      },
      {
        titulo: 'superficie', caminho: ['terreno', 'superficie'], campos: [
          { nome: 'offsetprofundidadegrama', apresentacao: 'afundamento da grama', tipo: 'float' },
        ]
      },
    ]
  },
  {
    titulo: 'arvore config', secoes: [
      {
        titulo: 'arvores', caminho: ['arvore', 'arvores'], campos: [
          { nome: 'quantidade', apresentacao: 'quantidade', tipo: 'uint' },
          { nome: 'alturaTronco', apresentacao: 'altura do tronco', tipo: 'float' },
          { nome: 'alturaTroncoRand', apresentacao: 'variacao da altura', tipo: 'float' },
          { nome: 'raioTronco', apresentacao: 'raio do tronco', tipo: 'float' },
          { nome: 'raioTroncoRand', apresentacao: 'variacao do raio', tipo: 'float' },
          { nome: 'anguloRandMax', apresentacao: 'rotacao aleatoria maxima', tipo: 'float' },
          { nome: 'inclinacaoRandMax', apresentacao: 'inclinacao aleatoria maxima', tipo: 'float' },
          { nome: 'afundamentoBase', apresentacao: 'afundamento da base', tipo: 'float' },
          { nome: 'segmentosTronco', apresentacao: 'segmentos do tronco', tipo: 'uint' },
          { nome: 'distanciaEstrada', apresentacao: 'distancia da estrada', tipo: 'float' },
        ]
      },
    ]
  },
  {
    titulo: 'grama config', secoes: [
      {
        titulo: 'grama', caminho: ['grama', 'grama'], campos: [
          { nome: 'quantidade', apresentacao: 'quantidade', tipo: 'uint' },
          { nome: 'altura', apresentacao: 'altura', tipo: 'float' },
          { nome: 'raio', apresentacao: 'raio', tipo: 'float' },
          { nome: 'segmentos', apresentacao: 'segmentos', tipo: 'uint' },
          { nome: 'distanciaEstrada', apresentacao: 'distancia da estrada', tipo: 'float' },
        ]
      },
    ]
  },
  {
    titulo: 'estrada config', secoes: [
      {
        titulo: 'estrada', caminho: ['estrada', 'estrada'], aplicarAoSoltar: true, campos: [
          { nome: 'largura', apresentacao: 'largura', tipo: 'float' },
          { nome: 'anguloCurva', apresentacao: 'angulo da curva (graus)', tipo: 'float', min: 0, max: 85 },
          { nome: 'comprimentoCurva', apresentacao: 'comprimento da curva', tipo: 'float' },
          { nome: 'larguraTransicao', apresentacao: 'largura da transicao', tipo: 'float' },
          { nome: 'linhaLargura', apresentacao: 'largura da linha', tipo: 'float' },
          { nome: 'linhaMargem', apresentacao: 'margem da linha lateral', tipo: 'float' },
          { nome: 'tracoComprimento', apresentacao: 'comprimento do traco', tipo: 'float' },
          { nome: 'tracoVao', apresentacao: 'vao entre tracos', tipo: 'float' },
        ],
        interruptores: [{ nome: 'marcacoes', rotulo: 'marcacoes da pista' }],
      },
    ]
  },
  {
    titulo: 'ceu config', secoes: [
      {
        titulo: 'hora do dia', caminho: ['ceu', 'parametros'], campos: [
          { nome: 'hora', apresentacao: 'hora', tipo: 'float', min: 0, max: 24, ciclico: true },
          { nome: 'duracaoDia', apresentacao: 'duracao do dia (segundos)', tipo: 'float' },
          { nome: 'azimute', apresentacao: 'azimute do nascente (graus)', tipo: 'float', min: 0, max: 360, ciclico: true },
          { nome: 'inclinacaoSol', apresentacao: 'inclinacao do sol (graus)', tipo: 'float', min: 0, max: 70 },
        ],
        interruptores: [{ nome: 'cicloAtivo', rotulo: 'o tempo passa sozinho' }],
      },
      secaoCor('ceu (cor do alto)', 'zenite', [], ['ceu', 'parametros']),
      {
        titulo: 'sol e estrelas', caminho: ['ceu', 'parametros'], campos: [
          { nome: 'solTamanho', apresentacao: 'tamanho do sol', tipo: 'float', min: 0.005, max: 0.15 },
          { nome: 'solBrilho', apresentacao: 'brilho em volta do sol', tipo: 'float', min: 0, max: 3 },
        ],
        interruptores: [{ nome: 'estrelas', rotulo: 'estrelas a noite' }],
      },
      {
        titulo: 'nuvens', caminho: ['ceu', 'parametros'], campos: [
          { nome: 'nuvensQuantidade', apresentacao: 'quantidade', tipo: 'uint', min: 0, max: 400 },
          { nome: 'nuvensAltura', apresentacao: 'altitude', tipo: 'float' },
          { nome: 'nuvensRaio', apresentacao: 'alcance em volta da camera', tipo: 'float' },
          { nome: 'nuvensEscala', apresentacao: 'tamanho', tipo: 'float' },
          { nome: 'nuvensVelocidade', apresentacao: 'velocidade do vento', tipo: 'float' },
          { nome: 'nuvensDirecao', apresentacao: 'direcao do vento (graus)', tipo: 'float', min: 0, max: 360, ciclico: true },
        ],
        interruptores: [{ nome: 'nuvens', rotulo: 'mostrar nuvens' }],
      },
    ]
  },
  {
    titulo: 'piloto config', secoes: [
      {
        titulo: 'parametros', caminho: ['pilotoAutomatico', 'parametros'], campos: [
          { nome: 'lookaheadBase', apresentacao: 'antecipacao base', tipo: 'float' },
          { nome: 'lookaheadVel', apresentacao: 'antecipacao por velocidade', tipo: 'float' },
          { nome: 'lookaheadForaPista', apresentacao: 'antecipacao fora da pista', tipo: 'float' },
          { nome: 'kLead', apresentacao: 'ganho de antecipacao do volante', tipo: 'float' },
          { nome: 'kYaw', apresentacao: 'ganho de correcao do yaw', tipo: 'float' },
          { nome: 'fatorVelCurva', apresentacao: 'fator de velocidade na curva', tipo: 'float' },
          { nome: 'fatorFreio', apresentacao: 'fator de freio', tipo: 'float' },
          { nome: 'velMinCurva', apresentacao: 'velocidade minima na curva', tipo: 'float' },
          { nome: 'fatorLinha', apresentacao: 'fator da linha de corrida', tipo: 'float' },
          { nome: 'margemLinha', apresentacao: 'margem da linha de corrida', tipo: 'float' },
          { nome: 'raioRefLinha', apresentacao: 'raio de referencia da linha', tipo: 'float' },
        ]
      },
    ]
  },
];