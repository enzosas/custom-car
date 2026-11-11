// config.ts

const FISICA_BASE = {
    aceleracao: 0.03,
    aceleracaoFreio: 0.04,
    velmax: 7.0,
    velmaxre: -2.0,
    velocidadeGiro: 0.03,
    taxaLerpVolante: 0.025,
    aderenciaFreioDeMao: 0.015,
    aderenciaPista: 0.03,
    atritoEscalar: 0.9999,
    atritoLinear: 0.001,
    suspensaoRigidez: 80.0,
    suspensaoAmortecimento: 8.0,
    suspensaoInclinacaoMax: 8.0,
    velReferenciaGiro: 0.5,
    taxaRecuperacaoGrip: 0.02,
    forcaPulo: 70.0,
    gravidade: 150.0,
    fatorPuloMinimo: 0.55,
    tempoCargaPulo: 0.6,
    compressaoPulo: 1.4,
    reacaoPouso: 1.0,
    // reação do chassi ao relevo (só visual; 0 desliga e o chassi acompanha o terreno de forma rígida)
    reacaoTerrenoAngular: 0.5,    // quanto o chassi "fica para trás" nas mudanças de inclinação do terreno (pitch/roll)
    reacaoTerrenoVertical: 0.15,  // quanto a carroceria comprime/alivia em vales e cristas
    limiarDecolagem: 10.0,
    limiarDriftRastro: 0.9,
};

const COCKPIT_BASE = {
    taxaBaseCockpitTras: 0.1,
    taxaTopoCockpitTras: 0.2,
    taxaTopoCockpitFrente: 0.6,
    taxaBaseCockpitFrente: 0.7,
};

/** Carro procedural (o "vermelho") */
export const PERFIL_CARRO_VERMELHO = {
    dimensoes: {
        largura: 10.0,
        comprimento: 20.0,
        alturachao: 2.0,
        alturaporta: 4.5,
        alturaparabrisa: 4.5,
        comprimentorodas: 13.0,
        largurarodas: 10.0,
        offsetchassi: 0.0,
        ...COCKPIT_BASE,
    },
    rodas: { raio: 2.0, largura: 1.5, segmentos: 16 },
    fisica: { ...FISICA_BASE, suspensaoRigidez: 150.0 },
};

/** Carro carregado de um modelo .glb */
export const PERFIL_CARRO_GLB = {
    dimensoes: {
        largura: 10.0,
        comprimento: 40.0,
        alturachao: 2.0,
        alturaporta: 4.5,
        alturaparabrisa: 4.5,
        comprimentorodas: 26.5,
        largurarodas: 15.9,
        offsetchassi: 0.100,
        ...COCKPIT_BASE,
    },
    rodas: { raio: 3.2, largura: 1.5, segmentos: 16 },
    fisica: { ...FISICA_BASE },
};

export type PerfilCarro = typeof PERFIL_CARRO_VERMELHO;

export const GAME_CONFIG = {
    pilotoAutomaticoOn: false,
    // o jogo sempre come a no carro vermelho; o Jogo troca para o perfil GLB com a tecla X
    carro: structuredClone(PERFIL_CARRO_VERMELHO) as PerfilCarro,
    /** interruptores (liga/desliga) do painel; cada chave aqui vira uma linha de switch via `interruptores` em painelCampos.ts */
    opcoes: {
        rodasVisiveis: true,
    },
    terreno: {
        parametros: {
            espacamento: 30060.0,    // distância entre vértices = espacamento * 0.005 (~150): triângulos grandes
            ondulacao: 24000.0,      // altura máxima do relevo = ondulacao * 0.05 (1200)
            comprimentoOnda: 1962.9446, // tamanho (unidades) dos morros
            oitavas: 4,              // camadas de detalhe do relevo
            persistencia: 0.5,       // quanto cada camada de detalhe seguinte pesa (0 = suave, 1 = muito rugoso)
            celulasPorChunk: 32,     // resolução de um chunk (4 a 250); mudar recria todos os chunks
            raioChunks: 4,           // chunks carregados em volta do carro; precisa cobrir a neblina (~15000 / tamanho do chunk). Menos = mais leve
        },
        // Cor do terreno por altitude, inclinação e bioma (e onde cresce vegetação). Mudar reconstrói o terreno.
        paleta: {
            ativa: true,             // false = terreno de uma cor só, como antes
            escalaBioma: 26000.0,    // tamanho aproximado de cada região de bioma (verde, oliva, dourado, outono, savana, deserto)
            altitudeRocha: 0.62,     // altitude (0..1 da altura máxima) em que a grama dá lugar à rocha e acaba a vegetação
            altitudeNeve: 0.90,      // altitude em que começa a neve
            inclinacaoRocha: 0.45,   // inclinação (0 = plano, 1 = 45°) a partir da qual a encosta vira rocha
            variacaoCor: 0.08,       // variação de brilho por manchas e por vértice (0 = cor chapada)
        },
        superficie: {
            offsetprofundidadegrama: 0.0,
        },
    },
    arvore: {
        arvores: {
            quantidade: 8000,
            alturaTronco: 400.0,
            alturaTroncoRand: 0.35,
            raioTronco: 20.0,
            raioTroncoRand: 0.3,
            anguloRandMax: 360.0,
            inclinacaoRandMax: 0.1,
            afundamentoBase: 2.5,
            segmentosTronco: 4,
            distanciaEstrada: 20.0,
        }
    },
    grama: {
        grama: {
            quantidade: 16000,
            altura: 5.0,
            raio: 1.0,
            segmentos: 4,
            distanciaEstrada: 30.0,
        }
    },
    estrada: {
        estrada: {
            largura: 80.0,
            anguloCurva: 40.0,       // graus: quanto a pista pode se desviar da direção geral (0 = reta; acima de 85 é limitado)
            comprimentoCurva: 1800.0, // distância (unidades) em que cada curva se desenvolve: maior = curvas mais longas e suaves
            larguraTransicao: 400.0, // faixa em volta do platô da pista onde o terreno volta ao relevo natural (maior = pista corta menos os morros)
            // marcações: duas linhas brancas contínuas nas laterais e uma tracejada no centro (só visual)
            marcacoes: true,
            linhaLargura: 1.5,       // largura de cada linha
            linhaMargem: 4.0,        // distância entre a borda do asfalto e a linha lateral
            tracoComprimento: 50.0,  // comprimento de cada traço da linha central
            tracoVao: 75.0,          // espaço entre os traços (0 = linha central contínua)
        }
    },
    luz: {
        // Todas as cores são HSV: H em graus (0-360), S e V de 0 a 1.
        // Cada papel tem a sua própria cor, para o céu poder ser azul sem tingir o resto do mapa.
        parametros: {
            dirX: 0.35,
            dirY: 0.85,
            dirZ: 0.35,
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
    camera: {
        parametros: {
            distanciaRaioBase: 80.0,
            pitchPadrao: 15.0,
            suavizacaoPos: 0.5,
            suavizacaoTarget: 1.0,
            taxaRetornoOrbita: 0.03,
            sensibilidadeMouse: 0.35,
            offsetX: 0.0,
            offsetY: 0.0,
            offsetZ: 0.0,
            offsetYaw: 0.0,          // graus: gira a câmera em órbita em volta do carro (positivo = para a direita do carro)
            offsetRoll: 0.0,         // graus: inclina o horizonte (positivo = câmera inclina para a direita)
        }
    },
    pilotoAutomatico: {
        parametros: {
            lookaheadBase: 80.0,
            lookaheadVel: 30.0,
            lookaheadForaPista: 150.0,
            kLead: 2.0,
            kYaw: 0.05,
            fatorVelCurva: 0.9,
            fatorFreio: 0.8,
            velMinCurva: 1.5,
            fatorLinha: 0.5,
            margemLinha: 12.0,
            raioRefLinha: 600.0,
        }
    }
};