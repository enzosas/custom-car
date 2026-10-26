// config.ts

export const GAME_CONFIG = {
    pilotoAutomaticoOn: false,

    carro: {
        dimensoes: {
            largura: 10.0,
            comprimento: 20.0,
            alturachao: 2.0,
            alturaporta: 4.5,
            alturaparabrisa: 4.5,
            comprimentorodas: 13.0,
            largurarodas: 10.0,
            taxaBaseCockpitTras: 0.1,
            taxaTopoCockpitTras: 0.2,
            taxaTopoCockpitFrente: 0.6,
            taxaBaseCockpitFrente: 0.7,
        },
        rodas: {
            raio: 2.0,
            largura: 1.5,
            segmentos: 16,
        },
        fisica: {
            aceleracao: 0.03,
            aceleracaoFreio: 0.04,
            velmax: 7.0,
            velmaxre: -2.0,
            anguloVolanteMax: 0.7,
            velocidadeGiro: 0.03,
            taxaLerpVolante: 0.035,
            aderenciaFreioDeMao: 0.015,
            aderenciaPista: 0.03,
            atritoEscalar: 0.9999,
            atritoLinear: 0.001,
            arrastoQuadratico: 0.0,
            suspensaoRigidez: 150.0,
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
            limiarDecolagem: 10.0,
            limiarDriftRastro: 0.9,
        }
    },

    terreno: {
        parametros: {
            ptcontrole: 10,
            subdivisoes: 32,
            espacamento: 18000.0,
            ondulacao: 24000.0,
            fatorborda: 0.3,
        },
        superficie: {
            offsetprofundidadegrama: 0.0,
        },
        visualizacao: {
            fatorOpacidade: 1.0,
        }
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
            quantidadePontosControle: 20,
            raioBase: 0.35,
            quantidadeRuido: 0.5,
            offsetElevacao: 0.7,
        }
    },

    luz: {
        parametros: {
            dirX: 0.35,
            dirY: 0.85,
            dirZ: 0.35,
            corR: 1.0,
            corG: 1.0,
            corB: 1.0,
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