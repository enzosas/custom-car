// materialPrincipal.ts   materiais do jogo (shader principal, rastro, profundidade, part culas).
import * as THREE from 'three';
import { GAME_CONFIG } from '@/core/config';
import { corSol, corCeu, corAmbiente } from './cor';
import {
    vertexPrincipal, fragmentPrincipal, vertexProfundidade, fragmentProfundidade,
    vertexParticula, fragmentParticula, vertexCeu, fragmentCeu, vertexArvorePS2, fragmentArvorePS2,
    vertexProfundidadeArvore, fragmentProfundidadeArvore,
} from './shaders';
import type { Atmosfera } from './Atmosfera';
import { TILE_CHAO } from './texturasPS2';

/** Uniforms compartilhados por todos os materiais que usam o shader principal */
export function criarUniformsCompartilhados() {
    const l = GAME_CONFIG.luz.parametros;
    return {
        uLightDir: { value: new THREE.Vector3(0, 1, 0) },     // a direção vem da atmosfera (ver atualizarLuz)
        uLightColor: { value: new THREE.Vector3(...corSol(l)) },
        uAmbientColor: { value: new THREE.Vector3(...corAmbiente(l)) },
        uFogColor: { value: new THREE.Vector3(...corCeu(l)) },
        uNeblina: { value: l.neblina },
        uFogNear: { value: 500 },     // onde a neblina começa e onde cobre tudo; vêm da atmosfera (atualizarLuz)
        uFogFar: { value: 1500 },
        // brilho da neblina e do céu em volta do sol (ver glslHorizonte em shaders.ts)
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunGlow: { value: new THREE.Vector3(1, 1, 1) },
        uSunGlowAmt: { value: 0 },
        uAmbient: { value: l.intensidadeAmbiente },
        uDiffuse: { value: l.intensidadeDifusa },
        uSpecular: { value: l.intensidadeEspecular },
        uShininess: { value: l.shininess },
        uShadowMap: { value: null as THREE.Texture | null },
        uShadowTexel: { value: new THREE.Vector2(1 / 4096, 1 / 4096) },
        uShadowOn: { value: 0 },
        // sombra RELATIVA (ver shaders.ts): longe da origem as matrizes absolutas perdem precisão em float32
        uLightSpaceCam: { value: new THREE.Matrix4() },   // passe principal: luz * translação(câmera - origem da sombra)
        uLightSpaceRel: { value: new THREE.Matrix4() },   // passe de profundidade: luz * vista, relativa à origem
        uOrigemSombra: { value: new THREE.Vector3() },    // origem da sombra (valor em float32)
    };
}

export type UniformsCompartilhados = ReturnType<typeof criarUniformsCompartilhados>;

/** passa a atmosfera do frame (sol, cores, neblina) para os uniforms compartilhados */
export function atualizarLuz(u: UniformsCompartilhados, a: Atmosfera) {
    u.uLightDir.value.set(a.dirLuz[0], a.dirLuz[1], a.dirLuz[2]);
    u.uLightColor.value.set(a.corLuz[0], a.corLuz[1], a.corLuz[2]);
    u.uAmbientColor.value.set(a.corAmbiente[0], a.corAmbiente[1], a.corAmbiente[2]);
    u.uFogColor.value.set(a.corHorizonte[0], a.corHorizonte[1], a.corHorizonte[2]); // neblina sempre na cor do horizonte do céu
    u.uNeblina.value = a.neblina;
    u.uFogNear.value = a.neblinaInicio;
    u.uFogFar.value = a.neblinaFim;
    u.uAmbient.value = a.intAmbiente;
    u.uDiffuse.value = a.intDifusa;
    u.uSpecular.value = a.intEspecular;
    u.uShininess.value = a.shininess;
    u.uSunDir.value.set(a.dirSol[0], a.dirSol[1], a.dirSol[2]);
    u.uSunGlow.value.set(a.corBrilhoSol[0], a.corBrilhoSol[1], a.corBrilhoSol[2]);
    u.uSunGlowAmt.value = a.brilhoNeblina;
}

/** Domo do céu: gradiente, estrelas e sol. Fica no fundo (profundidade máxima), sem escrever profundidade. */
export function criarMaterialCeu(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexCeu,
        fragmentShader: fragmentCeu,
        side: THREE.BackSide,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,   // o domo está exatamente na profundidade do fundo
        uniforms: {
            uFogColor: u.uFogColor, uSunDir: u.uSunDir, uSunGlow: u.uSunGlow, uSunGlowAmt: u.uSunGlowAmt,
            uZenith: { value: new THREE.Vector3(0.3, 0.5, 0.9) },
            uSunColor: { value: new THREE.Vector3(1, 1, 1) },
            uSunSize: { value: 0.035 },
            uSunBright: { value: 1.0 },
            uNight: { value: 0 },
            // camada de nuvens do estilo PS2 (só existe no shader com NUVENS_PS2; ver Ceu.atualizar)
            uTexNuvensCeu: { value: null as THREE.Texture | null },
            uNuvOff: { value: new THREE.Vector4() },
            uNuvTile: { value: new THREE.Vector2(1800, 600) },
            uNuvH: { value: 210 },
            uNuvCobertura: { value: 0.4 },
            uNuvOn: { value: 0 },
            uNuvNoite: { value: 0 },
        },
    });
}

export function criarMaterialPrincipal(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,            // atributo `color` (aColor no C++)
        side: THREE.DoubleSide,        // glDisable(GL_CULL_FACE)
        uniforms: { ...u, uAlpha: { value: 1.0 } },
    });
}

/** nuvens low poly: o shader principal com a luz própria de nuvem (#define NUVEM); o brilho vem de ceu.nuvensBrilho */
export function criarMaterialNuvem(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,
        side: THREE.DoubleSide,
        defines: { NUVEM: '' },
        uniforms: { ...u, uAlpha: { value: 1.0 }, uBrilhoNuvens: { value: 1.0 } },
    });
}

/**
 * Vegetação (árvores e tufos de grama): por enquanto o mesmo shader do asfalto, mas em materiais PRÓPRIOS, porque no
 * estilo PS2 eles passam a ter alpha test e textura, enquanto o terreno, o céu e o carro continuam no `matOpaco`.
 */
export function criarMaterialVegetacao(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,
        side: THREE.DoubleSide,
        uniforms: { ...u, uAlpha: { value: 1.0 } },
    });
}

/**
 * Árvores do estilo PS2: cartões com alpha test. `face` = true gira o cartão para a câmera (árvores distantes);
 * false = cartões fixos em X (perto). O atlas entra em uTexArvore quando o estilo é ligado (WorldBuilder.definirEstilo).
 */
export function criarMaterialArvorePS2(u: UniformsCompartilhados, face: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexArvorePS2,
        fragmentShader: fragmentArvorePS2,
        defines: face ? { FACE_CAMERA: '1' } : {},
        side: THREE.DoubleSide,
        uniforms: { ...u, uTexArvore: { value: null as THREE.Texture | null }, uTamAtlas: { value: new THREE.Vector2(512, 256) } },
    });
}

/**
 * Liga/desliga a variante PS2 de um material: o shader recebe `#define ESTILO_PS2` e o three recompila o programa.
 * O mesmo objeto de material continua em uso (nenhum mesh precisa ser trocado).
 */
export function definirEstiloMaterial(m: THREE.ShaderMaterial, ps2: boolean, extras: string[] = []) {
    const defines: Record<string, string | number | boolean> = { ...(m.defines ?? {}) };
    for (const nome of ['ESTILO_PS2', ...extras]) { if (ps2) defines[nome] = '1'; else delete defines[nome]; }
    m.defines = defines;
    m.needsUpdate = true;
}

/**
 * Terreno (grama e asfalto no mesmo mesh): o shader principal, em material próprio. No estilo PS2 ele ganha
 * `TEXTURA_CHAO`: as texturas entram em uTexGrama/uTexAsfalto quando o estilo é ligado (ver WorldBuilder.definirEstilo).
 */
export function criarMaterialTerreno(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,
        side: THREE.DoubleSide,
        uniforms: {
            ...u,
            uAlpha: { value: 1.0 },
            uTexGrama: { value: null as THREE.Texture | null },
            uTexAsfalto: { value: null as THREE.Texture | null },
            uTexTile: { value: new THREE.Vector4(TILE_CHAO.gramaFino, TILE_CHAO.gramaGrosso, TILE_CHAO.asfaltoFino, TILE_CHAO.asfaltoGrosso) },
            uTexOffG: { value: new THREE.Vector4() },
            uTexOffA: { value: new THREE.Vector4() },
            uContrasteGrama: { value: 1.0 },
            uCorDetalheGrama: { value: 1.0 },
            uTexSup: { value: null as THREE.Texture | null },     // R rocha, G neve, B areia, A terra (detalhe em tons de cinza)
            uTileSup: { value: new THREE.Vector2(TILE_CHAO.superficieFino, TILE_CHAO.superficieGrosso) },
            uOffSup: { value: new THREE.Vector4() },
            uContrasteSup: { value: 1.0 },
            uTexTerra: { value: null as THREE.Texture | null },   // foto terra.jpg COM a cor (terra de outono); só vale com uFotoTerra = 1
            uCorMediaTerra: { value: new THREE.Vector3(0.4, 0.3, 0.2) },
            uFotoTerra: { value: 0.0 },
            uInfluenciaTerra: { value: 0.15 },     // 0 = a foto original, 1 = cor do terreno (a foto só varia o claro e escuro)
        },
    });
}

/**
 * Marcações da pista: mesmo shader do asfalto, mas puxadas na direção da câmera na profundidade (polygonOffset).
 * Só a folga geométrica não basta: com o plano próximo em 0,03 m e o distante em 1500 m, o buffer de profundidade perde
 * resolução com a distância (a ~100 m ele distingue só ~2 cm) e as linhas piscariam contra o asfalto.
 */
export function criarMaterialMarcacao(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
        uniforms: { ...u, uAlpha: { value: 1.0 } },
    });
}

/** Rastro: mesmo shader, blending alfa, uAlpha = 0.40, sem escrita de profundidade */
export function criarMaterialRastro(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexPrincipal,
        fragmentShader: fragmentPrincipal,
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: { ...u, uAlpha: { value: 0.40 } },
    });
}

/** Passe de profundidade: glPolygonOffset(2, 4) */
export function criarMaterialProfundidade(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexProfundidade,
        fragmentShader: fragmentProfundidade,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 4,
        colorWrite: false,
        uniforms: { uLightSpaceRel: u.uLightSpaceRel, uOrigemSombra: u.uOrigemSombra },
    });
}

/** profundidade dos cartões de árvore do estilo PS2 (ver vertexProfundidadeArvore): usa o mesmo atlas do quadro principal */
export function criarMaterialProfundidadeArvore(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexProfundidadeArvore,
        fragmentShader: fragmentProfundidadeArvore,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 4,
        colorWrite: false,
        uniforms: {
            uLightSpaceRel: u.uLightSpaceRel, uOrigemSombra: u.uOrigemSombra, uLightDir: u.uLightDir,
            uTexArvore: { value: null as THREE.Texture | null },
        },
    });
}

export function criarMaterialParticula(u: UniformsCompartilhados): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: vertexParticula,
        fragmentShader: fragmentParticula,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: u, // Partilha os mesmos uniforms de luz e ambiente
    });
}