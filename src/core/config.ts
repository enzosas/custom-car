// config.ts
//
// Tudo em unidades do SI: comprimentos em metros, tempo em segundos, massas não aparecem (se cancelam). Para ficar
// legível, velocidades do carro vêm em km/h e giros em graus/s (a física converte na entrada).

const FISICA_BASE = {
    aceleracao: 10.8,             // m/s²: aceleração do motor partindo do zero (cai perto da velocidade máxima)
    frenagem: 14.4,               // m/s²: desaceleração do freio (e da ré trocando de sentido)
    velMaxKmh: 151.2,             // km/h
    velMaxReKmh: 43.2,            // km/h: velocidade máxima de ré
    giroGrausS: 103.13,            // graus/s: rotação do carro com o volante todo virado
    velGiroTotalKmh: 10.8,        // km/h: abaixo disso o carro gira menos (parado não gira)
    tempoVolante: 0.658,           // s: quanto o volante demora para responder (constante de tempo)
    tempoDeslizePista: 0.547,      // s: quanto o deslize lateral demora para morrer com os pneus agarrando
    tempoDeslizeFreioMao: 1.103,   // s: o mesmo com o freio de mão puxado (maior = drift mais longo)
    tempoRecuperacaoGrip: 0.825,   // s: quanto a aderência demora para voltar depois de soltar o freio de mão
    perdaPontoMorto: 0.066,       // 1/s: fração da velocidade perdida por segundo sem acelerar nem frear
    velocidadePulo: 5.66,         // m/s: velocidade para cima no pulo com carga cheia (1,6 m de altura)
    gravidade: 9.81,              // m/s²
    fatorPuloMinimo: 0.55,        // fração da velocidade do pulo sem carga
    tempoCargaPulo: 0.6,          // s: tempo segurando para a carga cheia
    compressaoPulo: 0.14,         // m: quanto a carroceria afunda ao segurar o pulo (carga cheia)
    limiarDecolagemKmh: 3.6,      // km/h: numa crista, quanto o chão pode "fugir" para baixo antes de o carro sair do chão
    limiarDriftRastroKmh: 19.44,  // km/h: deslize lateral a partir do qual o pneu deixa rastro
};

/**
 * Suspensão da carroceria (só visual: não muda por onde o carro anda), com grandezas de um carro de verdade.
 * A inclinação ao frear, acelerar e fazer curva SAI DELAS (transferência de peso), junto com o entre-eixos e a
 * distância entre rodas das dimensões; a massa do carro se cancela nas contas, por isso não aparece aqui.
 */
const SUSPENSAO_BASE = {
    frequencia: 1.42,             // Hz: frequência natural da suspensão (carro comum 1 a 1,5; esportivo 2 a 3)
    amortecimento: 0.45,          // fração do amortecimento crítico (carro comum 0,2 a 0,4; 1 = volta sem balançar)
    alturaCentroMassa: 0.55,      // m: altura do centro de massa acima do chão; mais alto = inclina mais
    barraEstabilizadora: 2.5,     // quantas vezes a rolagem nas curvas é mais dura que a mola sozinha (1 = sem barra)
    curso: 0.19,                  // m: quanto a suspensão comprime ou estica; nunca passa da altura do chão
};

const COCKPIT_BASE = {
    taxaBaseCockpitTras: 0.1,
    taxaTopoCockpitTras: 0.2,
    taxaTopoCockpitFrente: 0.6,
    taxaBaseCockpitFrente: 0.7,
};

/** Carro procedural (o "vermelho") */
export const PERFIL_CARRO_VERMELHO = {
    dimensoes: {                 // metros
        largura: 1.0,
        comprimento: 2.0,
        alturachao: 0.2,
        alturaporta: 0.45,
        alturaparabrisa: 0.45,
        comprimentorodas: 1.3,
        largurarodas: 1.0,
        offsetchassi: 0.0,
        ...COCKPIT_BASE,
    },
    rodas: { raio: 0.2, largura: 0.15, segmentos: 16 },   // metros
    fisica: { ...FISICA_BASE },
    // carro menor e mais duro que o GLB
    suspensao: { ...SUSPENSAO_BASE, frequencia: 1.95, amortecimento: 0.33, alturaCentroMassa: 0.35 },
};

/** Carro carregado de um modelo .glb */
export const PERFIL_CARRO_GLB = {
    dimensoes: {                 // metros
        largura: 1.0,
        comprimento: 4.0,
        alturachao: 0.2,
        alturaporta: 0.45,
        alturaparabrisa: 0.45,
        comprimentorodas: 2.65,
        largurarodas: 1.59,
        offsetchassi: 0.01,
        ...COCKPIT_BASE,
    },
    rodas: { raio: 0.32, largura: 0.15, segmentos: 16 },  // metros
    fisica: { ...FISICA_BASE },
    suspensao: { ...SUSPENSAO_BASE },
};

export type PerfilCarro = typeof PERFIL_CARRO_VERMELHO;

export const GAME_CONFIG = {
    pilotoAutomaticoOn: false,
    // o jogo sempre come a no carro vermelho; o Jogo troca para o perfil GLB com a tecla X
    carro: structuredClone(PERFIL_CARRO_VERMELHO) as PerfilCarro,
    /** interruptores (liga/desliga) do painel; cada chave aqui vira uma linha de switch via `interruptores` em painelCampos.ts */
    opcoes: {
        rodasVisiveis: true,
        /** sombras: meia largura da área com sombra em volta do carro (m); mais = vai mais longe, menos nítida */
        alcanceSombra: 300,
        /** sombras: resolução do mapa (1 = 1024, 2 = 2048, 3 = 4096, 4 = 8192); mais = mais nítida e mais pesada */
        qualidadeSombra: 3,
        /** false = low poly (padrão); true = visual de PS2 (GT4). Alterna também com a tecla G */
        estiloPS2: false,
        /** estilo PS2: altura interna fixa do desenho, em pixels (o PS2 fazia 480 linhas; o padrão aqui é 360); o navegador amplia com filtro bilinear */
        alturaInternaPS2: 360,
        /** estilo PS2: onde a neblina começa e onde cobre tudo (m); no low poly são 500 e 1500 */
        neblinaInicioPS2: 150,
        neblinaFimPS2: 900,
        /** estilo PS2: quanto o horizonte (céu, neblina e fundo) é puxado para um azul-acinzentado de dia; 0 = nada, 1 = todo */
        tomHorizontePS2: 0.55,
        /** estilo PS2: tamanho das texturas do chão (1 = padrão; 2 = o dobro, mais esticadas; 0.5 = a metade, mais repetidas) */
        escalaTexturaPS2: 1,
        /** estilo PS2: força do detalhe da grama (0 = grama lisa, 1 = a textura inteira) */
        contrasteGramaPS2: 1,
        /** estilo PS2: quanto da COR da foto de grama entra no detalhe (0 = só claro e escuro, 1 = a cor toda, com as folhas secas laranja) */
        corDetalheGramaPS2: 0.35,
        /** estilo PS2: força do detalhe de pedra, neve, areia e terra de outono (0 = cor lisa, 1 = a textura inteira) */
        contrasteSuperficiesPS2: 1,
        /**
         * estilo PS2: quanto a cor do terreno (bioma) tinge a terra de outono quando existe a foto terra.jpg.
         * 0 = a foto original, sem tintura; 1 = a foto vira só um detalhe claro/escuro por cima da cor do bioma. Sem a foto, não faz nada.
         */
        influenciaCorTerrenoTerraPS2: 0.15,
    },
    terreno: {
        parametros: {
            espacamento: 3006.0,     // distância entre vértices = espacamento * 0.005 m (~15 m): triângulos grandes
            ondulacao: 2400.0,       // altura máxima do relevo = ondulacao * 0.05 m (120 m)
            comprimentoOnda: 196.29446, // m: tamanho dos morros
            oitavas: 4,              // camadas de detalhe do relevo
            persistencia: 0.5,       // quanto cada camada de detalhe seguinte pesa (0 = suave, 1 = muito rugoso)
            celulasPorChunk: 32,     // resolução de um chunk (4 a 250); mudar recria todos os chunks
            raioChunks: 4,           // chunks carregados em volta do carro; precisa cobrir a neblina (~1500 m / tamanho do chunk). Menos = mais leve
        },
        // Cor do terreno por altitude, inclinação e bioma (e onde cresce vegetação). Mudar reconstrói o terreno.
        paleta: {
            ativa: true,             // false = terreno de uma cor só, como antes
            escalaBioma: 2600.0,     // m: tamanho aproximado de cada região de bioma (verde, oliva, dourado, outono, savana, deserto)
            altitudeRocha: 0.62,     // altitude (0..1 da altura máxima) em que a grama dá lugar à rocha e acaba a vegetação
            altitudeNeve: 0.90,      // altitude em que começa a neve
            inclinacaoRocha: 0.45,   // inclinação (0 = plano, 1 = 45°) a partir da qual a encosta vira rocha
            variacaoCor: 0.08,       // variação de brilho por manchas e por vértice (0 = cor chapada)
        },
        superficie: {
            offsetprofundidadegrama: 0.0,
            particulas: true,        // false = desliga todas as partículas do carro (fumaça, grama, areia, neve, folhas, poeira)
        },
    },
    arvore: {
        arvores: {
            quantidade: 8000,
            alturaTronco: 4.0,       // m (a árvore inteira tem ~1,85x isso, com as copas)
            alturaTroncoRand: 0.35,
            raioTronco: 0.4,         // m, na base (a copa mais larga tem 4,5x isso)
            raioTroncoRand: 0.3,
            anguloRandMax: 360.0,
            inclinacaoRandMax: 0.1,
            afundamentoBase: 0.25,   // m
            segmentosTronco: 4,
            distanciaEstrada: 2.0,   // m
        },
        // distâncias (da câmera, em metros) em que cada árvore troca de nível de detalhe. Ficam fora de
        // `arvores` de propósito: mudar aqui não reconstrói a vegetação, vale no quadro seguinte.
        lod: {
            lod1: 300.0,            // até aqui: árvore completa (low poly) / dois cartões em cruz (retro)
            lod2: 418.3,            // até aqui: 3 segmentos (low poly) / cartão de frente (retro)
            lod3: 612.4,            // até aqui: cone único (low poly); depois: billboard
            maxima: 2738.6,         // além disso a árvore não é desenhada
        },
    },
    grama: {
        grama: {
            quantidade: 16000,
            altura: 0.5,             // m
            raio: 0.1,               // m
            segmentos: 4,
            distanciaEstrada: 3.0,   // m
        }
    },
    estrada: {
        estrada: {
            largura: 8.0,            // m
            anguloCurva: 40.0,       // graus: quanto a pista pode se desviar da direção geral (0 = reta; acima de 85 é limitado)
            comprimentoCurva: 180.0, // m: distância em que cada curva se desenvolve: maior = curvas mais longas e suaves
            larguraTransicao: 40.0,  // m: faixa em volta do platô da pista onde o terreno volta ao relevo natural (maior = pista corta menos os morros)
            // marcações: duas linhas brancas contínuas nas laterais e uma tracejada no centro (só visual)
            marcacoes: true,
            linhaLargura: 0.15,      // m: largura de cada linha
            linhaMargem: 0.4,        // m: distância entre a borda do asfalto e a linha lateral
            tracoComprimento: 5.0,   // m: comprimento de cada traço da linha central
            tracoVao: 7.5,           // m: espaço entre os traços (0 = linha central contínua)
        }
    },
    luz: {
        // Todas as cores são HSV: H em graus (0-360), S e V de 0 a 1.
        // Cada papel tem a sua própria cor, para o céu poder ser azul sem tingir o resto do mapa.
        parametros: {
            // sol (difuso + especular)
            corH: 0.0,
            corS: 0.0,
            corV: 1.0,
            // céu: fundo da tela (clearColor) e também a cor da neblina; não ilumina nada
            ceuH: 210.0,
            ceuS: 0.1111,
            ceuV: 0.90,
            neblina: 1.0,           // intensidade da neblina (0 desliga); a cor é a do céu
            // luz ambiente (uniforme, não depende da direção da face)
            ambienteH: 210.0,
            ambienteS: 0.1111,
            ambienteV: 0.90,
            intensidadeAmbiente: 0.5,
            intensidadeDifusa: 0.45,
            intensidadeEspecular: 0.05,
            shininess: 20.0,
        }
    },

    // Céu, hora do dia e nuvens. A luz de cima (luz.parametros) é o visual de DIA: ao baixar o sol as cores
    // escorregam para o pôr do sol e para a noite sem mexer nela.
    ceu: {
        parametros: {
            hora: 13.0,              // 0 a 24 (6 = nascer do sol, 12 = meio-dia, 18 = pôr do sol)
            cicloAtivo: false,       // o tempo passa sozinho
            duracaoDia: 480.0,       // segundos reais que um dia inteiro leva
            azimute: 283.0,          // graus: direção horizontal do nascente (0 = +x, 90 = +z); o pôr do sol fica no lado oposto
            inclinacaoSol: 25.0,     // graus: quanto a trajetória do sol se inclina (o sol a pino fica a 90 - isto de altura)
            // cor do céu no alto, fixa (não aparece mais no painel); o horizonte usa a cor do céu de luz.parametros
            zeniteH: 215.0,
            zeniteS: 0.55,
            zeniteV: 0.85,
            solTamanho: 0.035,       // raio do disco do sol (radianos)
            solBrilho: 1.0,          // intensidade do halo em volta do sol
            estrelas: true,
            nuvens: true,
            nuvensQuantidade: 60.0,  // sem limite: o buffer de instâncias cresce conforme precisa
            nuvensAltura: 210.0,     // m: altitude das nuvens (as montanhas chegam a ~120 m)
            nuvensRaio: 1400.0,      // m: até onde as nuvens aparecem em volta da câmera
            nuvensEscala: 1.0,
            nuvensBrilho: 1.0,       // multiplica a luz das nuvens low poly (1 = padrão)
            nuvensVelocidade: 1.2,   // m/s
            nuvensDirecao: 30.0,     // graus (0 = +x, 90 = +z)
        }
    },
    camera: {
        parametros: {
            distanciaRaioBase: 8.0,  // m
            pitchPadrao: 15.0,
            suavizacaoPos: 0.5,
            suavizacaoTarget: 1.0,
            taxaRetornoOrbita: 0.03,
            autoCentrarVerticalmente: true, // true = o pitch ajustado com o mouse é relativo à inclinação do terreno (a câmera acompanha morros na mesma velocidade de taxaRetornoOrbita)
            sensibilidadeMouse: 0.35,
            offsetX: 0.0,
            offsetY: 0.0,
            offsetZ: 0.0,
            offsetYaw: 0.0,          // graus: gira a câmera em órbita em volta do carro (positivo = para a direita do carro)
            offsetRoll: 0.0,         // graus: inclina o horizonte (positivo = câmera inclina para a direita)
            seguirChassi: false,     // true = a câmera acompanha a carroceria (afunda, inclina e rola com a suspensão)
        }
    },
    pilotoAutomatico: {
        parametros: {
            lookaheadBase: 8.0,      // m
            antecipacaoTempo: 0.5,   // s: o ponto mirado fica a mais esta quantidade de segundos à frente na velocidade atual
            lookaheadForaPista: 15.0, // m
            kLead: 2.0,
            kYaw: 0.05,
            fatorVelCurva: 0.9,
            fatorFreio: 0.8,
            velMinCurvaKmh: 32.4,    // km/h: o piloto nunca planeja passar das curvas abaixo disso
            fatorLinha: 0.5,
            margemLinha: 1.2,        // m
            raioRefLinha: 60.0,      // m
        }
    }
};