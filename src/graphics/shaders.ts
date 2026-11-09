// shaders.ts — port de shader/shader.vert + shader.frag (+ depth).
// Normal "flat" por derivadas de tela, Blinn-Phong, sombra PCF 3x3 e neblina.
// O original não faz correção de gama nem tone mapping: o ShaderMaterial também não faz (valores crus).
//
// Sombra:
//  - PCF bilinear sobre 3x3 texels (16 leituras, contra 25 do 5x5 original): bordas suaves, sem o aspecto de
//    "blocos" que o PCF com leituras 'nearest' tem quando o mapa é mais grosso;
//  - saída antecipada: 5 leituras de teste (centro + cantos da área do filtro). Se todas concordam (tudo iluminado
//    ou tudo em sombra) devolve direto; só os pixels na borda da sombra fazem o filtro completo;
//  - o fade acontece nas bordas da caixa da sombra (e não pela distância da câmera) e é calculado ANTES do laço:
//    pixels fora do alcance não leem a textura;
//  - a sombra só é calculada onde a superfície está voltada para a luz (diff > 0).

export const vertexPrincipal = /* glsl */ `
varying vec3 vFragPos;
varying vec3 vColor;
varying vec4 vFragPosLightSpace;
uniform mat4 uLightSpaceMatrix;

void main() {
#ifdef USE_INSTANCING
    mat4 model = modelMatrix * instanceMatrix;
#else
    mat4 model = modelMatrix;
#endif
    vec4 worldPos = model * vec4(position, 1.0);
    vFragPos = worldPos.xyz;
    vColor = color;

    vFragPosLightSpace = uLightSpaceMatrix * worldPos;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const fragmentPrincipal = /* glsl */ `
varying vec3 vFragPos;
varying vec3 vColor;
varying vec4 vFragPosLightSpace;
uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform vec3  uAmbientColor;
uniform vec3  uFogColor;
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
    vec3 dX = dFdx(vFragPos);
    vec3 dY = dFdy(vFragPos);
    vec3 normal = normalize(cross(dX, dY));

    vec3 lDir = normalize(uLightDir);
    vec3 viewDir = normalize(cameraPosition - vFragPos);

    vec3 ambient = uAmbient * uAmbientColor * vColor;

    float diff = max(dot(normal, lDir), 0.0);
    vec3 diffuse = uDiffuse * diff * uLightColor * vColor;

    vec3 halfwayDir = normalize(lDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), max(uShininess, 1.0));
    vec3 specular = uSpecular * spec * uLightColor;

    float shadow = (uShadowOn > 0.5 && diff > 0.0) ? calcularSombra(vFragPosLightSpace, normal, lDir) : 0.0;
    shadow *= 0.60;

    vec3 result = ambient + (1.0 - shadow) * (diffuse + specular);

    float distCam = length(cameraPosition - vFragPos);
    float fogFactor = clamp((distCam - 5000.0) / (15000.0 - 5000.0), 0.0, 1.0);

    result = mix(result, uFogColor, clamp(fogFactor * uNeblina, 0.0, 1.0));

    gl_FragColor = vec4(result, uAlpha);
}
`;

export const vertexProfundidade = /* glsl */ `
uniform mat4 uLightSpaceMatrix;
void main() {
#ifdef USE_INSTANCING
    mat4 model = modelMatrix * instanceMatrix;
#else
    mat4 model = modelMatrix;
#endif
    gl_Position = uLightSpaceMatrix * model * vec4(position, 1.0);
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
varying vec4 vCor;
varying vec3 vFragPos;

uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uFogColor;
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
    result = mix(result, uFogColor, clamp(fogFactor * uNeblina, 0.0, 1.0));

    gl_FragColor = vec4(result, vCor.a);
}
`;