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
  /** unidade mostrada à direita do valor (ex.: 'km/h', 'm') */
  unidade?: string;
  /** a config guarda uma fração (0,55) e o painel mostra porcentagem (55 %); só a exibição muda */
  percentual?: boolean;
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
  /** mostra, logo abaixo do título, a linha com os dois botões "low poly" e "retro" (escolhe opcoes.estiloPS2) */
  seletorEstilo?: boolean;
  /** o jogo só recebe o novo valor quando o arrasto termina (para ajustes caros, como reconstruir o terreno) */
  aplicarAoSoltar?: boolean;
}

export interface AbaDef { titulo: string; secoes: SecaoDef[] }

export const ABAS: AbaDef[] = [
  {
    titulo: 'carro config 1', secoes: [
      {
        titulo: 'dimensoes', caminho: ['carro', 'dimensoes'], campos: [
          { nome: 'largura', apresentacao: 'largura', unidade: 'm', tipo: 'float' },
          { nome: 'comprimento', apresentacao: 'comprimento', unidade: 'm', tipo: 'float' },
          { nome: 'alturachao', apresentacao: 'altura do chao', unidade: 'm', tipo: 'float' },
          { nome: 'alturaporta', apresentacao: 'altura da porta', unidade: 'm', tipo: 'float' },
          { nome: 'alturaparabrisa', apresentacao: 'altura do parabrisa', unidade: 'm', tipo: 'float' },
          { nome: 'comprimentorodas', apresentacao: 'distancia entre eixos', unidade: 'm', tipo: 'float' },
          { nome: 'largurarodas', apresentacao: 'distancia entre rodas', unidade: 'm', tipo: 'float' },
          { nome: 'offsetchassi', apresentacao: 'offset chassi', unidade: 'm', tipo: 'float' },
          { nome: 'taxaBaseCockpitTras', apresentacao: 'cockpit base traseira', percentual: true, tipo: 'float' },
          { nome: 'taxaTopoCockpitTras', apresentacao: 'cockpit topo traseira', percentual: true, tipo: 'float' },
          { nome: 'taxaTopoCockpitFrente', apresentacao: 'cockpit topo frente', percentual: true, tipo: 'float' },
          { nome: 'taxaBaseCockpitFrente', apresentacao: 'cockpit base frente', percentual: true, tipo: 'float' },
        ]
      },
      {
        titulo: 'rodas', caminho: ['carro', 'rodas'], campos: [
          { nome: 'raio', apresentacao: 'raio', unidade: 'm', tipo: 'float' },
          { nome: 'largura', apresentacao: 'largura', unidade: 'm', tipo: 'float' },
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
          { nome: 'aceleracao', apresentacao: 'aceleracao', unidade: 'm/s²', tipo: 'float' },
          { nome: 'frenagem', apresentacao: 'frenagem', unidade: 'm/s²', tipo: 'float' },
          { nome: 'velMaxKmh', apresentacao: 'velocidade maxima', unidade: 'km/h', tipo: 'float' },
          { nome: 'velMaxReKmh', apresentacao: 'velocidade maxima de re', unidade: 'km/h', tipo: 'float' },
          { nome: 'giroGrausS', apresentacao: 'giro', unidade: 'graus/s', tipo: 'float' },
          { nome: 'velGiroTotalKmh', apresentacao: 'velocidade para giro total', unidade: 'km/h', tipo: 'float' },
          { nome: 'tempoVolante', apresentacao: 'resposta do volante', unidade: 's', tipo: 'float' },
          { nome: 'tempoDeslizePista', apresentacao: 'fim do deslize lateral', unidade: 's', tipo: 'float' },
          { nome: 'tempoDeslizeFreioMao', apresentacao: 'deslize com freio de mao', unidade: 's', tipo: 'float' },
          { nome: 'tempoRecuperacaoGrip', apresentacao: 'recuperacao da aderencia', unidade: 's', tipo: 'float' },
          { nome: 'perdaPontoMorto', apresentacao: 'perda em ponto morto', unidade: '1/s', tipo: 'float' },
          { nome: 'velocidadePulo', apresentacao: 'velocidade do pulo', unidade: 'm/s', tipo: 'float' },
          { nome: 'gravidade', apresentacao: 'gravidade', unidade: 'm/s²', tipo: 'float' },
          { nome: 'fatorPuloMinimo', apresentacao: 'pulo minimo', percentual: true, tipo: 'float' },
          { nome: 'tempoCargaPulo', apresentacao: 'tempo de carga do pulo', unidade: 's', tipo: 'float' },
          { nome: 'compressaoPulo', apresentacao: 'compressao do pulo', unidade: 'm', tipo: 'float' },
          { nome: 'limiarDecolagemKmh', apresentacao: 'limiar de decolagem', unidade: 'km/h', tipo: 'float' },
          { nome: 'limiarDriftRastroKmh', apresentacao: 'limiar do rastro de drift', unidade: 'km/h', tipo: 'float' },
        ]
      },
      {
        titulo: 'suspensao', caminho: ['carro', 'suspensao'], campos: [
          { nome: 'frequencia', apresentacao: 'frequencia', unidade: 'Hz', tipo: 'float' },
          { nome: 'amortecimento', apresentacao: 'amortecimento', percentual: true, tipo: 'float', min: 0.05, max: 1 },
          { nome: 'alturaCentroMassa', apresentacao: 'altura do centro de massa', unidade: 'm', tipo: 'float' },
          { nome: 'barraEstabilizadora', apresentacao: 'barra estabilizadora', unidade: 'x', tipo: 'float' },
          { nome: 'curso', apresentacao: 'curso da suspensao', unidade: 'm', tipo: 'float' },
        ]
      },
    ]
  },
  {
    titulo: 'camera config', secoes: [
      {
        titulo: 'parametros', caminho: ['camera', 'parametros'], campos: [
          { nome: 'distanciaRaioBase', apresentacao: 'distancia', unidade: 'm', tipo: 'float' },
          { nome: 'pitchPadrao', apresentacao: 'inclinacao padrao (pitch)', unidade: 'graus', tipo: 'float' },
          { nome: 'suavizacaoPos', apresentacao: 'suavizacao da posicao', tipo: 'float' },
          { nome: 'suavizacaoTarget', apresentacao: 'suavizacao do alvo', tipo: 'float' },
          { nome: 'taxaRetornoOrbita', apresentacao: 'retorno da orbita', tipo: 'float' },
          { nome: 'sensibilidadeMouse', apresentacao: 'sensibilidade do mouse', tipo: 'float' },
          { nome: 'offsetX', apresentacao: 'offset x', unidade: 'm', tipo: 'float' },
          { nome: 'offsetY', apresentacao: 'offset y', unidade: 'm', tipo: 'float' },
          { nome: 'offsetZ', apresentacao: 'offset z', unidade: 'm', tipo: 'float' },
          { nome: 'offsetYaw', apresentacao: 'offset yaw', unidade: 'graus', tipo: 'float' },
          { nome: 'offsetRoll', apresentacao: 'offset roll', unidade: 'graus', tipo: 'float' },
        ],
        interruptores: [
          { nome: 'autoCentrarVerticalmente', rotulo: 'auto-centrar verticalmente' },
          { nome: 'seguirChassi', rotulo: 'seguir o chassi (suspensao)' },
        ],
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
          { nome: 'comprimentoOnda', apresentacao: 'comprimento da onda', unidade: 'm', tipo: 'float' },
          { nome: 'oitavas', apresentacao: 'oitavas', tipo: 'uint', min: 1, max: 8 },
          { nome: 'persistencia', apresentacao: 'persistencia', percentual: true, tipo: 'float', min: 0, max: 1 },
          { nome: 'celulasPorChunk', apresentacao: 'celulas por chunk', tipo: 'uint', min: 4, max: 250 },
          { nome: 'raioChunks', apresentacao: 'raio de chunks', tipo: 'uint', min: 1, max: 12 },
        ]
      },
      {
        titulo: 'paleta (cor por bioma, altitude e inclinacao)', caminho: ['terreno', 'paleta'], aplicarAoSoltar: true, campos: [
          { nome: 'escalaBioma', apresentacao: 'tamanho dos biomas', unidade: 'm', tipo: 'float' },
          { nome: 'altitudeRocha', apresentacao: 'altitude da rocha', percentual: true, tipo: 'float', min: 0, max: 1 },
          { nome: 'altitudeNeve', apresentacao: 'altitude da neve', percentual: true, tipo: 'float', min: 0, max: 1 },
          { nome: 'inclinacaoRocha', apresentacao: 'inclinacao da rocha', percentual: true, tipo: 'float', min: 0, max: 1.5 },
          { nome: 'variacaoCor', apresentacao: 'variacao de cor', percentual: true, tipo: 'float', min: 0, max: 0.3 },
        ],
        interruptores: [{ nome: 'ativa', rotulo: 'paleta ligada' }],
      },
      {
        titulo: 'superficie', caminho: ['terreno', 'superficie'], campos: [
          { nome: 'offsetprofundidadegrama', apresentacao: 'afundamento da grama', tipo: 'float' },
        ],
        interruptores: [{ nome: 'particulas', rotulo: 'particulas ligadas' }],
      },
    ]
  },
  {
    titulo: 'arvore config', secoes: [
      {
        titulo: 'arvores', caminho: ['arvore', 'arvores'], campos: [
          { nome: 'quantidade', apresentacao: 'quantidade', tipo: 'uint' },
          { nome: 'alturaTronco', apresentacao: 'altura do tronco', unidade: 'm', tipo: 'float' },
          { nome: 'alturaTroncoRand', apresentacao: 'variacao da altura', percentual: true, tipo: 'float' },
          { nome: 'raioTronco', apresentacao: 'raio do tronco', unidade: 'm', tipo: 'float' },
          { nome: 'raioTroncoRand', apresentacao: 'variacao do raio', percentual: true, tipo: 'float' },
          { nome: 'anguloRandMax', apresentacao: 'rotacao aleatoria maxima', unidade: 'graus', tipo: 'float' },
          { nome: 'inclinacaoRandMax', apresentacao: 'inclinacao aleatoria maxima', tipo: 'float' },
          { nome: 'afundamentoBase', apresentacao: 'afundamento da base', unidade: 'm', tipo: 'float' },
          { nome: 'segmentosTronco', apresentacao: 'segmentos do tronco', tipo: 'uint' },
          { nome: 'distanciaEstrada', apresentacao: 'distancia da estrada', unidade: 'm', tipo: 'float' },
        ]
      },
      {
        titulo: 'distancias de LOD', caminho: ['arvore', 'lod'], campos: [
          { nome: 'lod1', apresentacao: 'fim do LOD 0 (completa / cruz)', unidade: 'm', tipo: 'float', min: 0 },
          { nome: 'lod2', apresentacao: 'fim do LOD 1 (3 segmentos)', unidade: 'm', tipo: 'float', min: 0 },
          { nome: 'lod3', apresentacao: 'fim do LOD 2 (cone)', unidade: 'm', tipo: 'float', min: 0 },
          { nome: 'maxima', apresentacao: 'distancia maxima', unidade: 'm', tipo: 'float', min: 0 },
        ]
      },
    ]
  },
  {
    titulo: 'grama config', secoes: [
      {
        titulo: 'grama', caminho: ['grama', 'grama'], campos: [
          { nome: 'quantidade', apresentacao: 'quantidade', tipo: 'uint' },
          { nome: 'altura', apresentacao: 'altura', unidade: 'm', tipo: 'float' },
          { nome: 'raio', apresentacao: 'raio', unidade: 'm', tipo: 'float' },
          { nome: 'segmentos', apresentacao: 'segmentos', tipo: 'uint' },
          { nome: 'distanciaEstrada', apresentacao: 'distancia da estrada', unidade: 'm', tipo: 'float' },
        ]
      },
    ]
  },
  {
    titulo: 'estrada config', secoes: [
      {
        titulo: 'estrada', caminho: ['estrada', 'estrada'], aplicarAoSoltar: true, campos: [
          { nome: 'largura', apresentacao: 'largura', unidade: 'm', tipo: 'float' },
          { nome: 'anguloCurva', apresentacao: 'angulo da curva', unidade: 'graus', tipo: 'float', min: 0, max: 85 },
          { nome: 'comprimentoCurva', apresentacao: 'comprimento da curva', unidade: 'm', tipo: 'float' },
          { nome: 'larguraTransicao', apresentacao: 'largura da transicao', unidade: 'm', tipo: 'float' },
          { nome: 'linhaLargura', apresentacao: 'largura da linha', unidade: 'm', tipo: 'float' },
          { nome: 'linhaMargem', apresentacao: 'margem da linha lateral', unidade: 'm', tipo: 'float' },
          { nome: 'tracoComprimento', apresentacao: 'comprimento do traco', unidade: 'm', tipo: 'float' },
          { nome: 'tracoVao', apresentacao: 'vao entre tracos', unidade: 'm', tipo: 'float' },
        ],
        interruptores: [{ nome: 'marcacoes', rotulo: 'marcacoes da pista' }],
      },
    ]
  },
  {
    titulo: 'ceu config', secoes: [
      {
        titulo: 'hora do dia', caminho: ['ceu', 'parametros'], campos: [
          { nome: 'hora', apresentacao: 'hora', unidade: 'h', tipo: 'float', min: 0, max: 24, ciclico: true },
          { nome: 'duracaoDia', apresentacao: 'duracao do dia', unidade: 's', tipo: 'float' },
          { nome: 'azimute', apresentacao: 'azimute do nascente', unidade: 'graus', tipo: 'float', min: 0, max: 360, ciclico: true },
          { nome: 'inclinacaoSol', apresentacao: 'inclinacao do sol', unidade: 'graus', tipo: 'float', min: 0, max: 70 },
        ],
        interruptores: [{ nome: 'cicloAtivo', rotulo: 'o tempo passa sozinho' }],
      },
      {
        titulo: 'sol e estrelas', caminho: ['ceu', 'parametros'], campos: [
          { nome: 'solTamanho', apresentacao: 'tamanho do sol', tipo: 'float', min: 0.005, max: 0.15 },
          { nome: 'solBrilho', apresentacao: 'brilho em volta do sol', tipo: 'float', min: 0, max: 3 },
        ],
        interruptores: [{ nome: 'estrelas', rotulo: 'estrelas a noite' }],
      },
      {
        titulo: 'nuvens', caminho: ['ceu', 'parametros'], campos: [
          { nome: 'nuvensQuantidade', apresentacao: 'quantidade', tipo: 'uint', min: 0 },
          { nome: 'nuvensAltura', apresentacao: 'altitude', unidade: 'm', tipo: 'float' },
          { nome: 'nuvensRaio', apresentacao: 'alcance em volta da camera', unidade: 'm', tipo: 'float' },
          { nome: 'nuvensEscala', apresentacao: 'tamanho', tipo: 'float' },
          { nome: 'nuvensBrilho', apresentacao: 'brilho (low poly)', tipo: 'float', min: 0, max: 2 },
          { nome: 'nuvensVelocidade', apresentacao: 'velocidade do vento', unidade: 'm/s', tipo: 'float' },
          { nome: 'nuvensDirecao', apresentacao: 'direcao do vento', unidade: 'graus', tipo: 'float', min: 0, max: 360, ciclico: true },
        ],
        interruptores: [{ nome: 'nuvens', rotulo: 'mostrar nuvens' }],
      },
    ]
  },
  {
    // tudo que muda o visual do jogo (e não o carro): o estilo (low poly ou retro, tecla G) e os ajustes do estilo retro
    titulo: 'grafico config', secoes: [
      { titulo: 'estilo grafico (tecla G)', caminho: ['opcoes'], campos: [], seletorEstilo: true },
      {
        titulo: 'sombras', caminho: ['opcoes'], campos: [
          { nome: 'alcanceSombra', apresentacao: 'alcance', unidade: 'm', tipo: 'float', min: 20, max: 400 },
          { nome: 'qualidadeSombra', apresentacao: 'qualidade (1 a 4)', tipo: 'uint', min: 1, max: 4 },
        ]
      },
      {
        titulo: 'imagem (retro)', caminho: ['opcoes'], campos: [
          { nome: 'alturaInternaPS2', apresentacao: 'altura interna', unidade: 'px', tipo: 'uint', min: 240, max: 1080 },
          { nome: 'escalaTexturaPS2', apresentacao: 'escala das texturas do chao', tipo: 'float', min: 0.25, max: 4 },
        ]
      },
      {
        titulo: 'neblina e horizonte (retro)', caminho: ['opcoes'], campos: [
          { nome: 'neblinaInicioPS2', apresentacao: 'neblina: inicio', unidade: 'm', tipo: 'float', min: 0, max: 1000 },
          { nome: 'neblinaFimPS2', apresentacao: 'neblina: fim', unidade: 'm', tipo: 'float', min: 100, max: 2000 },
          { nome: 'tomHorizontePS2', apresentacao: 'horizonte azul-acinzentado', percentual: true, tipo: 'float', min: 0, max: 1 },
        ]
      },
      {
        titulo: 'chao (retro)', caminho: ['opcoes'], campos: [
          { nome: 'contrasteGramaPS2', apresentacao: 'detalhe da grama', percentual: true, tipo: 'float', min: 0, max: 1.5 },
          { nome: 'corDetalheGramaPS2', apresentacao: 'cor do detalhe da grama', percentual: true, tipo: 'float', min: 0, max: 1 },
          { nome: 'contrasteSuperficiesPS2', apresentacao: 'detalhe de pedra, neve, areia e terra', percentual: true, tipo: 'float', min: 0, max: 1.5 },
          { nome: 'influenciaCorTerrenoTerraPS2', apresentacao: 'cor do terreno na terra de outono (0% = foto original)', percentual: true, tipo: 'float', min: 0, max: 1 },
        ]
      },
    ]
  },
  {
    titulo: 'piloto config', secoes: [
      {
        titulo: 'parametros', caminho: ['pilotoAutomatico', 'parametros'], campos: [
          { nome: 'lookaheadBase', apresentacao: 'antecipacao base', unidade: 'm', tipo: 'float' },
          { nome: 'antecipacaoTempo', apresentacao: 'antecipacao por velocidade', unidade: 's', tipo: 'float' },
          { nome: 'lookaheadForaPista', apresentacao: 'antecipacao fora da pista', unidade: 'm', tipo: 'float' },
          { nome: 'kLead', apresentacao: 'ganho de antecipacao do volante', tipo: 'float' },
          { nome: 'kYaw', apresentacao: 'ganho de correcao do yaw', tipo: 'float' },
          { nome: 'fatorVelCurva', apresentacao: 'fator de velocidade na curva', percentual: true, tipo: 'float' },
          { nome: 'fatorFreio', apresentacao: 'fator de freio', percentual: true, tipo: 'float' },
          { nome: 'velMinCurvaKmh', apresentacao: 'velocidade minima na curva', unidade: 'km/h', tipo: 'float' },
          { nome: 'fatorLinha', apresentacao: 'fator da linha de corrida', percentual: true, tipo: 'float' },
          { nome: 'margemLinha', apresentacao: 'margem da linha de corrida', unidade: 'm', tipo: 'float' },
          { nome: 'raioRefLinha', apresentacao: 'raio de referencia da linha', unidade: 'm', tipo: 'float' },
        ]
      },
    ]
  },
];