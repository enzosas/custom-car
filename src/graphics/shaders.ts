// shaders.ts — port de shader/shader.vert + shader.frag (+ depth).
// Normal "flat" por derivadas de tela, Blinn-Phong, sombra PCF 3x3 e neblina.
// O original não faz correção de gama nem tone mapping: o ShaderMaterial também não faz (valores crus).
//
// PRECISÃO LONGE DA ORIGEM: float32 só tem ~7 dígitos. Com o carro a centenas de milhares de unidades da origem, uma
// posição absoluta do mundo perde 0.03 ou mais de precisão, e o shader tira a normal "flat" das derivadas dessa
// posição: as faces passam a piscar. Por isso o shader principal trabalha RELATIVO À CÂMERA (vRel): a posição vem
// de modelViewMatrix (calculada em dupla precisão no JS) e fica sempre pequena. A sombra também é relativa
// (uLightSpaceCam e, no passe de profundidade, uLightSpaceRel + uOrigemSombra).
//
// Sombra:
//  - PCF bilinear sobre 3x3 texels (16 leituras, contra 25 do 5x5 original): bordas suaves, sem o aspecto de
//    "blocos" que o PCF com leituras 'nearest' tem quando o mapa é mais grosso;
//  - saída antecipada: 5 leituras de teste (centro + cantos da área do filtro). Se todas concordam (tudo iluminado
//    ou tudo em sombra) devolve direto; só os pixels na borda da sombra fazem o filtro completo;
//  - o fade acontece nas bordas da caixa da sombra (e não pela distância da câmera) e é calculado ANTES do laço:
//    pixels fora do alcance não leem a textura;
//  - a sombra só é calculada onde a superfície está voltada para a luz (diff > 0).

// Cor do horizonte na direção `d` (unitária, eixos do mundo): a cor da neblina/céu, mais clara em volta do sol.
// O domo do céu e a neblina do terreno usam a MESMA função, então o terreno distante some exatamente no céu.
const glslHorizonte = /* glsl */ `
uniform vec3 uFogColor;        // cor do céu no horizonte
uniform vec3 uSunDir;          // direção real do sol (pode estar abaixo do horizonte)
uniform vec3 uSunGlow;         // cor do brilho em volta do sol
uniform float uSunGlowAmt;     // intensidade desse brilho (0..1)
uniform float uFogNear;        // distância em que a neblina começa
uniform float uFogFar;         // distância em que ela cobre tudo
vec3 corHorizonte(vec3 d) {
    vec2 h = d.xz, s = uSunDir.xz;
    float lh = length(h), ls = length(s);
    float g = (lh > 1e-4 && ls > 1e-4) ? pow(max(dot(h / lh, s / ls), 0.0), 6.0) : 0.0;
    return uFogColor + uSunGlow * (g * uSunGlowAmt);
}
`;

export const vertexPrincipal = /* glsl */ `
varying vec3 vRel;                 // posição relativa à câmera, nos eixos do MUNDO (valores pequenos)
varying vec3 vColor;
varying vec4 vFragPosLightSpace;
#ifdef TEXTURA_CHAO
attribute float aAsfalto;          // 1 nos pedaços de asfalto, 0 no resto do terreno (ver Estrada.gerarMalhaTerrenoChunk)
varying float vAsfalto;
attribute vec4 aSup;               // pesos [rocha, neve, areia, terra] do vértice (ver Terreno.preencherAtributosChunk)
varying vec4 vSup;
#endif
#ifdef PALETA_PS2
attribute vec3 colorPS2;           // a cor do vértice com a paleta do estilo PS2 (ver Paleta.ts)
#endif
uniform mat4 uLightSpaceCam;       // luz * translação(câmera - origem da sombra)

void main() {
    // modelViewMatrix já vem da CPU em dupla precisão (câmera e objeto subtraídos antes de virar float32)
    mat4 mv = modelViewMatrix;
#ifdef USE_INSTANCING
    mv = mv * instanceMatrix;
#endif
    vec4 mvPos = mv * vec4(position, 1.0);

    // do espaço da vista de volta para os eixos do mundo, SEM somar a posição da câmera: R^T * v
    vRel = mvPos.xyz * mat3(viewMatrix);
#ifdef PALETA_PS2
    vColor = colorPS2;
#else
    vColor = color;
#endif
#ifdef TEXTURA_CHAO
    vAsfalto = aAsfalto;
    vSup = aSup;
#endif
#ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;         // cor por instância (tufos de grama: a cor do terreno sob cada um)
#endif

    vFragPosLightSpace = uLightSpaceCam * vec4(vRel, 1.0);
    gl_Position = projectionMatrix * mvPos;
}
`;

export const fragmentPrincipal = /* glsl */ `
${glslHorizonte}
varying vec3 vRel;
varying vec3 vColor;
varying vec4 vFragPosLightSpace;
uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform vec3  uAmbientColor;
uniform float uNeblina;
uniform float uAlpha;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uSpecular;
uniform float uShininess;
#ifdef NUVEM
uniform float uBrilhoNuvens;
#endif

uniform sampler2D uShadowMap;
uniform vec2  uShadowTexel;
uniform float uShadowOn;

#ifdef TEXTURA_CHAO
// estilo PS2, só no terreno: textura de detalhe da grama e do asfalto, em duas escalas multiplicadas
varying float vAsfalto;
uniform sampler2D uTexGrama;
uniform sampler2D uTexAsfalto;
uniform vec4 uTexTile;             // tamanho de uma repetição: x,y = grama fino/grosso; z,w = asfalto fino/grosso
uniform vec4 uTexOffG;             // fract(posição da câmera / tile), calculado em dupla precisão no JS: xy = fino, zw = grosso
uniform vec4 uTexOffA;
uniform float uContrasteGrama;     // 0 = grama lisa, 1 = a textura inteira
uniform float uCorDetalheGrama;    // 0 = o detalhe só clareia e escurece, 1 = leva também a cor da foto (folhas secas laranja)
// pedra, neve, areia e terra de outono: um detalhe em tons de cinza por canal (R, G, B, A), em duas escalas; a COR vem do vértice
varying vec4 vSup;
uniform sampler2D uTexSup;
uniform vec2 uTileSup;             // tamanho de uma repetição: x = fino, y = grosso
uniform vec4 uOffSup;              // fract(posição da câmera / tile) em dupla precisão: xy = fino, zw = grosso
uniform float uContrasteSup;       // 0 = cor lisa, 1 = a textura inteira
// terra de outono com a FOTO original (terra.jpg): a cor da foto, e não só o claro e escuro por cima da cor do bioma
uniform sampler2D uTexTerra;
uniform vec3 uCorMediaTerra;       // cor média da foto
uniform float uFotoTerra;          // 1 = há foto (a terra de outono usa a foto), 0 = usa o detalhe do canal A de uTexSup
uniform float uInfluenciaTerra;    // 0 = a foto original, 1 = cor do bioma com a foto só variando o claro e escuro
#endif

// 1.0 se o ponto (profundidade zRef) está atrás do que o mapa registrou em uv, senão 0.0
float emSombra(vec2 uv, float zRef) {
    return (zRef > texture2D(uShadowMap, uv).r) ? 1.0 : 0.0;
}

float calcularSombra(vec4 posLuz, vec3 normal, vec3 lDir) {
    vec3 proj = posLuz.xyz / posLuz.w;
    proj = proj * 0.5 + 0.5;

    // fade nas bordas da caixa (círculo inscrito: 0 no centro, 1 no meio de cada lado); fora dele não há sombra
    float dBorda = length(proj.xy - 0.5) * 2.0;
    float fadeBorda = clamp((0.95 - dBorda) / 0.25, 0.0, 1.0);
    if (fadeBorda <= 0.0 || proj.z > 1.0 || proj.z < 0.0) return 0.0;

    float bias = max(0.0025 * (1.0 - dot(normal, lDir)), 0.0006);

    float zRef = proj.z - bias;

    // saída antecipada: centro + 4 cantos da área do filtro (1.5 texel); se concordam, não precisa filtrar
    vec2 o = uShadowTexel * 1.5;
    float teste = emSombra(proj.xy, zRef)
                + emSombra(proj.xy + vec2(-o.x, -o.y), zRef)
                + emSombra(proj.xy + vec2( o.x, -o.y), zRef)
                + emSombra(proj.xy + vec2(-o.x,  o.y), zRef)
                + emSombra(proj.xy + vec2( o.x,  o.y), zRef);
    if (teste < 0.5) return 0.0;
    if (teste > 4.5) return fadeBorda;

    // PCF bilinear: caixa de 3x3 texels com bordas ponderadas pela parte fracionária (16 leituras)
    vec2 p = proj.xy / uShadowTexel - 0.5;
    vec2 base = floor(p);
    vec2 f = p - base;
    float soma = 0.0;
    for (int j = -1; j <= 2; ++j) {
        float wy = (j == -1) ? 1.0 - f.y : ((j == 2) ? f.y : 1.0);
        for (int i = -1; i <= 2; ++i) {
            float wx = (i == -1) ? 1.0 - f.x : ((i == 2) ? f.x : 1.0);
            vec2 uv = (base + vec2(float(i), float(j)) + 0.5) * uShadowTexel;
            float prof = texture2D(uShadowMap, uv).r;
            soma += wx * wy * ((zRef > prof) ? 1.0 : 0.0);
        }
    }

    return (soma / 9.0) * fadeBorda;
}

void main() {
    vec3 dX = dFdx(vRel);
    vec3 dY = dFdy(vRel);
    vec3 normal = normalize(cross(dX, dY));

    vec3 lDir = normalize(uLightDir);
    vec3 viewDir = normalize(-vRel);

    vec3 albedo = vColor;
#ifdef TEXTURA_CHAO
    // UV do mundo SEM somar a posição da câmera (float32 não aguenta): vRel é pequeno, e a parte grande entra pronta em uTexOff
    vec2 pTex = vRel.xz;
    vec3 detGrama = texture2D(uTexGrama, pTex / uTexTile.x + uTexOffG.xy).rgb * texture2D(uTexGrama, pTex / uTexTile.y + uTexOffG.zw).rgb * 4.0;
    float lumGrama = dot(detGrama, vec3(0.299, 0.587, 0.114));
    detGrama = mix(vec3(lumGrama), detGrama, uCorDetalheGrama);
    detGrama = mix(vec3(1.0), detGrama, uContrasteGrama);
    vec3 detAsfalto = texture2D(uTexAsfalto, pTex / uTexTile.z + uTexOffA.xy).rgb * texture2D(uTexAsfalto, pTex / uTexTile.w + uTexOffA.zw).rgb * 4.0;
    // onde há rocha, neve, areia ou terra de outono, o detalhe da grama dá lugar ao dessa superfície (o resto continua grama)
    vec4 wSup = clamp(vSup, 0.0, 1.0);
    float somaSup = wSup.x + wSup.y + wSup.z + wSup.w;
    wSup /= max(somaSup, 1.0);
    vec4 detSup = texture2D(uTexSup, pTex / uTileSup.x + uOffSup.xy) * texture2D(uTexSup, pTex / uTileSup.y + uOffSup.zw) * 4.0;
    detSup = mix(vec4(1.0), detSup, uContrasteSup);
    // com a foto de terra, a parte "terra de outono" (wSup.w) sai daqui e entra mais abaixo com a cor da própria foto
    float wDetTerra = wSup.w * (1.0 - uFotoTerra);
    vec3 detSolo = detGrama * (1.0 - (wSup.x + wSup.y + wSup.z + wSup.w)) + vec3(dot(vec4(wSup.xyz, wDetTerra), detSup));
    vec3 detalhe = mix(detSolo, detAsfalto, clamp(vAsfalto, 0.0, 1.0));
    // longe o detalhe some (a neblina cobre e o mipmap já o apagou): evita cintilação
    float semDetalhe = smoothstep(2500.0, 9000.0, length(vRel));
    detalhe = mix(detalhe, vec3(1.0), semDetalhe);
    albedo *= detalhe;
    // terra de outono pela foto: dois tamanhos da mesma foto (o grosso só quebra a repetição), COR da foto como base.
    // Influência 0 = foto original; 1 = a cor do bioma com a foto variando o claro e escuro (a foto dividida pela sua média).
    vec3 fotoTerra = texture2D(uTexTerra, pTex / uTileSup.x + uOffSup.xy).rgb;
    float lumMedia = max(dot(uCorMediaTerra, vec3(0.299, 0.587, 0.114)), 0.01);
    float grosso = dot(texture2D(uTexTerra, pTex / uTileSup.y + uOffSup.zw).rgb, vec3(0.299, 0.587, 0.114)) / lumMedia;
    fotoTerra *= mix(1.0, clamp(grosso, 0.5, 1.6), 0.45);
    fotoTerra = mix(fotoTerra, uCorMediaTerra, semDetalhe);
    fotoTerra *= mix(vec3(1.0), vColor / max(uCorMediaTerra, vec3(0.02)), uInfluenciaTerra);
    albedo += fotoTerra * (wSup.w * uFotoTerra * (1.0 - clamp(vAsfalto, 0.0, 1.0)));
#endif

#ifdef NUVEM
    // nuvens low poly: vistas quase sempre de baixo, com a luz do terreno ficariam só com a ambiente (cinza escuro).
    // Luz "enrolada" (meio Lambert): o lado do sol fica claro, o oposto escurece pouco; sem brilho especular nem sombra.
    // A cor da luz (poente) e as intensidades (noite) continuam valendo.
    float envolta = dot(normal, lDir) * 0.5 + 0.5;
    vec3 luzNuvem = uAmbient * uAmbientColor + uDiffuse * uLightColor * (0.45 + 0.55 * envolta);
    vec3 result = albedo * luzNuvem * uBrilhoNuvens;
#else
    vec3 ambient = uAmbient * uAmbientColor * albedo;

    float diff = max(dot(normal, lDir), 0.0);
    vec3 diffuse = uDiffuse * diff * uLightColor * albedo;

    vec3 halfwayDir = normalize(lDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), max(uShininess, 1.0));
    vec3 specular = uSpecular * spec * uLightColor;

    float shadow = (uShadowOn > 0.5 && diff > 0.0) ? calcularSombra(vFragPosLightSpace, normal, lDir) : 0.0;
    shadow *= 0.60;

    vec3 result = ambient + (1.0 - shadow) * (diffuse + specular);
#endif

    float distCam = length(vRel);
    float fogFactor = clamp((distCam - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);

    result = mix(result, corHorizonte(vRel / max(distCam, 1e-4)), clamp(fogFactor * uNeblina, 0.0, 1.0));

    gl_FragColor = vec4(result, uAlpha);
}
`;

// Árvore do estilo PS2: um cartão com a textura de uma conífera (atlas de 4), alpha test, luz pintada na textura.
// FACE_CAMERA: o cartão gira em torno do eixo VERTICAL para ficar de frente para a câmera (sem FACE_CAMERA, são dois
// cartões fixos em X). A variante do atlas, o espelhamento e o brilho de cada árvore saem de um hash da posição da
// instância: nenhuma árvore precisa de cor própria, e a mesma árvore é igual em todos os LODs.
const glslHashArvore = /* glsl */ `
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
`;

export const vertexArvorePS2 = /* glsl */ `
varying vec2 vUv;
varying vec3 vRel;
varying vec3 vTom;
${glslHashArvore}

void main() {
    mat4 inst = mat4(1.0);
#ifdef USE_INSTANCING
    inst = instanceMatrix;
#endif
    float h1 = hash12(inst[3].xz);
    float h2 = hash12(inst[3].zx + 17.0);
    float h3 = hash12(inst[3].xz * 1.7 + 3.0);
    float h4 = hash12(inst[3].zx * 2.3 + 11.0);

    vec4 mvPos;
#ifdef FACE_CAMERA
    vec3 o = (modelViewMatrix * inst * vec4(0.0, 0.0, 0.0, 1.0)).xyz;      // base da árvore, no espaço da vista
    float sx = length(inst[0].xyz), sy = length(inst[1].xyz);
    vec3 upV = mat3(viewMatrix)[1];                                          // o "para cima" do mundo, no espaço da vista
    vec3 r = cross(o, upV);
    vec3 rightV = r / max(length(r), 1e-4);
    mvPos = vec4(o + rightV * (position.x * sx) + upV * (position.y * sy), 1.0);
#else
    mvPos = modelViewMatrix * inst * vec4(position, 1.0);
#endif

    vRel = mvPos.xyz * mat3(viewMatrix);       // posição relativa à câmera nos eixos do mundo (neblina)
    float variante = floor(h1 * 4.0);
    float u = (h2 > 0.5) ? 1.0 - uv.x : uv.x;
    vUv = vec2((u + variante) * 0.25, uv.y);
    vTom = (0.86 + 0.28 * h3) * vec3(1.0 + 0.10 * (h4 - 0.5), 1.0, 1.0 - 0.14 * (h4 - 0.5));
    gl_Position = projectionMatrix * mvPos;
}
`;

export const fragmentArvorePS2 = /* glsl */ `
${glslHorizonte}
varying vec2 vUv;
varying vec3 vRel;
varying vec3 vTom;
uniform sampler2D uTexArvore;
uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform vec3  uAmbientColor;
uniform float uNeblina;
uniform float uAmbient;
uniform float uDiffuse;

void main() {
    vec4 t = texture2D(uTexArvore, vUv);

    // alpha test; longe o mipmap dilui o alfa e a folhagem ralearia, então o limiar cai com o nível do mipmap
    vec2 tx = vUv * vec2(512.0, 256.0);
    vec2 dx = dFdx(tx), dy = dFdy(tx);
    float lod = max(0.0, 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-6)));
    if (t.a < clamp(0.5 - 0.06 * lod, 0.18, 0.5)) discard;

    // a luz já está pintada; aqui só segue o dia e a noite. 0.67 = o valor com a luz padrão (cor fica como pintada)
    vec3 luz = (uAmbient * uAmbientColor + uDiffuse * 0.6 * max(uLightDir.y, 0.0) * uLightColor) / 0.67;
    vec3 cor = t.rgb * vTom * luz;

    float distCam = length(vRel);
    float fogFactor = clamp((distCam - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);
    cor = mix(cor, corHorizonte(vRel / max(distCam, 1e-4)), clamp(fogFactor * uNeblina, 0.0, 1.0));
    gl_FragColor = vec4(cor, 1.0);
}
`;

export const vertexProfundidade = /* glsl */ `
uniform mat4 uLightSpaceRel;      // luz * vista, relativa à origem da sombra
uniform vec3 uOrigemSombra;       // origem (já em float32) em torno da qual o mapa é desenhado

void main() {
    // subtrai a origem da TRANSLAÇÃO do modelo antes de multiplicar pelo vértice: a diferença de dois números
    // grandes e já em float32 é exata, e o resultado fica pequeno
    mat4 model = modelMatrix;
    model[3].xyz -= uOrigemSombra;
#ifdef USE_INSTANCING
    model = model * instanceMatrix;
#endif
    gl_Position = uLightSpaceRel * model * vec4(position, 1.0);
}
`;

export const fragmentProfundidade = /* glsl */ `
void main() { gl_FragColor = vec4(1.0); }
`;

// Sombra das árvores do estilo PS2. O cartão que cai no mapa de sombras NÃO acompanha a câmera: ele fica de frente
// para o sol (eixo vertical, perpendicular à direção horizontal da luz), então a sombra no chão tem sempre o mesmo
// formato, não pisca ao girar a câmera e nunca vira uma linha fina. O mesmo hash da posição escolhe a mesma variante
// do atlas que o quadro principal desenha, e o alpha test recorta o contorno da copa.
// A largura vem de position.x + position.z: o cartão em X usa x, o segundo cartão da cruz (LOD 0) usa z.
export const vertexProfundidadeArvore = /* glsl */ `
uniform mat4 uLightSpaceRel;
uniform vec3 uOrigemSombra;
uniform vec3 uLightDir;
varying vec2 vUv;
${glslHashArvore}

void main() {
    mat4 model = modelMatrix;
    model[3].xyz -= uOrigemSombra;
    mat4 inst = mat4(1.0);
#ifdef USE_INSTANCING
    inst = instanceMatrix;
#endif
    float h1 = hash12(inst[3].xz);
    float h2 = hash12(inst[3].zx + 17.0);
    vec3 o = (model * inst * vec4(0.0, 0.0, 0.0, 1.0)).xyz;      // base da árvore, relativa à origem da sombra
    float sx = length(inst[0].xyz), sy = length(inst[1].xyz);
    vec3 d = vec3(uLightDir.x, 0.0, uLightDir.z);
    vec3 r = (length(d) > 1e-3) ? normalize(vec3(d.z, 0.0, -d.x)) : vec3(1.0, 0.0, 0.0);
    float largura = position.x + position.z;
    vec3 p = o + r * (largura * sx) + vec3(0.0, position.y * sy, 0.0);
    float variante = floor(h1 * 4.0);
    float u = (h2 > 0.5) ? 1.0 - uv.x : uv.x;
    vUv = vec2((u + variante) * 0.25, uv.y);
    gl_Position = uLightSpaceRel * vec4(p, 1.0);
}
`;

export const fragmentProfundidadeArvore = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uTexArvore;
void main() {
    if (texture2D(uTexArvore, vUv).a < 0.5) discard;
    gl_FragColor = vec4(1.0);
}
`;

// Partículas agora recebem a posição no mundo para o cálculo da neblina
export const vertexParticula = /* glsl */ `
attribute vec4 aCor;
varying vec4 vCor;
varying vec3 vFragPos;

void main() {
    vCor = aCor;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vFragPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const fragmentParticula = /* glsl */ `
${glslHorizonte}
varying vec4 vCor;
varying vec3 vFragPos;

uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uNeblina;

void main() {
    // Calculamos a luz ambiente (céu) + difusa (sol) para colorir a partícula
    vec3 iluminacao = (uAmbient * uAmbientColor) + (uDiffuse * uLightColor * 0.8);
    vec3 result = vCor.rgb * iluminacao;

    // Aplicamos a mesma neblina (fog) usada no terreno
    float distCam = length(cameraPosition - vFragPos);
    float fogFactor = clamp((distCam - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);
    result = mix(result, corHorizonte(normalize(vFragPos - cameraPosition)), clamp(fogFactor * uNeblina, 0.0, 1.0));

    gl_FragColor = vec4(result, vCor.a);
}
`;

// Céu: esfera unitária em volta da câmera, empurrada para a profundidade máxima (gl_Position.xyww)
export const vertexCeu = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = position;
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = p.xyww;
}
`;

export const fragmentCeu = /* glsl */ `
${glslHorizonte}
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uSunColor;
uniform float uSunSize;      // raio angular do disco (radianos)
uniform float uSunBright;    // intensidade do halo
uniform float uNight;        // 0 dia .. 1 noite (estrelas)
#ifdef NUVENS_PS2
// camada de nuvens do estilo PS2: um plano infinito acima da câmera, lido pixel a pixel (nenhum objeto nasce ou some)
uniform sampler2D uTexNuvensCeu;
uniform vec4  uNuvOff;       // fract(posição / tile) calculado no JS: xy = escala grande, zw = fina
uniform vec2  uNuvTile;      // tamanho de uma repetição da textura: grande, fina
uniform float uNuvH;         // altura do plano acima da câmera
uniform float uNuvCobertura; // 0 = limpo .. 1 = encoberto
uniform float uNuvOn;        // 0 = camada desligada
uniform float uNuvNoite;     // 0 dia .. 1 noite (escurece as nuvens)
#endif

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(corHorizonte(d), uZenith, pow(smoothstep(0.0, 0.75, d.y), 0.85));

    // estrelas: pontos quadrados (combinam com o estilo low poly), só acima do horizonte
    if (uNight > 0.01 && d.y > 0.0) {
        vec3 cel = floor(d * 240.0);
        float h = hash13(cel);
        float brilho = step(0.9970, h) * (0.5 + 0.5 * hash13(cel + 7.0));
        col += vec3(brilho) * uNight * smoothstep(0.02, 0.22, d.y);
    }

    // sol: disco, halo e brilho; some abaixo do horizonte
    vec3 sd = normalize(uSunDir);
    float c = dot(d, sd);
    float ang = acos(clamp(c, -1.0, 1.0));
    float vis = smoothstep(-0.04, 0.03, d.y);
    float halo = pow(max(c, 0.0), 48.0) * 0.55 + pow(max(c, 0.0), 6.0) * 0.18;
    col += uSunColor * (halo * uSunBright * vis);
    float disco = 1.0 - smoothstep(uSunSize * 0.9, uSunSize, ang);
    col = mix(col, uSunColor * 1.25, disco * vis);

#ifdef NUVENS_PS2
    // nuvens: onde o raio deste pixel cruza o plano. Perto do horizonte o ponto vai longe e as nuvens ficam pequenas e
    // achatadas (perspectiva), até sumirem na bruma: o horizonte também tem nuvens, e elas nunca "aparecem do nada"
    if (uNuvOn > 0.5 && d.y > 0.004) {
        vec2 rel = d.xz * (uNuvH / d.y);
        vec2 uvA = rel / uNuvTile.x + uNuvOff.xy;
        vec2 uvB = rel / uNuvTile.y + uNuvOff.zw;
        float nA = texture2D(uTexNuvensCeu, uvA).r;
        float nB = texture2D(uTexNuvensCeu, uvB).g;
        float n = 0.5 + (nA * 0.62 + nB * 0.38 - 0.5) * 1.3;
        float limiar = 0.5 - (uNuvCobertura - 0.5) * 0.6;
        float dens = smoothstep(limiar, limiar + 0.13, n);

        // luz: o lado da nuvem virado para o sol (onde há menos nuvem na direção do sol) é mais claro; o miolo denso, mais escuro
        vec2 paraSol = normalize(uSunDir).xz;
        float nSol = texture2D(uTexNuvensCeu, uvA + paraSol * 0.045).r;
        float luz = clamp(0.58 + 3.2 * (nA - nSol), 0.0, 1.0);
        luz *= 1.0 - 0.38 * smoothstep(limiar + 0.02, limiar + 0.34, n);
        vec3 tomSol = uSunColor / max(max(uSunColor.r, uSunColor.g), max(uSunColor.b, 0.001));
        vec3 claro = mix(vec3(1.0), tomSol, 0.6);                          // o poente tinge a nuvem
        vec3 ceuMedio = mix(corHorizonte(d), uZenith, 0.5);
        vec3 nuv = mix(ceuMedio * 0.72, claro, luz) * mix(1.0, 0.08, uNuvNoite);

        nuv = mix(nuv, corHorizonte(d), smoothstep(0.28, 0.02, d.y) * 0.9);   // bruma: as nuvens longe tomam a cor do horizonte
        col = mix(col, nuv, dens * smoothstep(0.004, 0.05, d.y) * 0.96);
    }
#endif

    gl_FragColor = vec4(col, 1.0);
}
`;