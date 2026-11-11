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
    vColor = color;
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

uniform sampler2D uShadowMap;
uniform vec2  uShadowTexel;
uniform float uShadowOn;

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

    vec3 ambient = uAmbient * uAmbientColor * vColor;

    float diff = max(dot(normal, lDir), 0.0);
    vec3 diffuse = uDiffuse * diff * uLightColor * vColor;

    vec3 halfwayDir = normalize(lDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), max(uShininess, 1.0));
    vec3 specular = uSpecular * spec * uLightColor;

    float shadow = (uShadowOn > 0.5 && diff > 0.0) ? calcularSombra(vFragPosLightSpace, normal, lDir) : 0.0;
    shadow *= 0.60;

    vec3 result = ambient + (1.0 - shadow) * (diffuse + specular);

    float distCam = length(vRel);
    float fogFactor = clamp((distCam - 5000.0) / (15000.0 - 5000.0), 0.0, 1.0);

    result = mix(result, corHorizonte(vRel / max(distCam, 1e-4)), clamp(fogFactor * uNeblina, 0.0, 1.0));

    gl_FragColor = vec4(result, uAlpha);
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
    float fogFactor = clamp((distCam - 5000.0) / (15000.0 - 5000.0), 0.0, 1.0);
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

    gl_FragColor = vec4(col, 1.0);
}
`;