// shaders.ts — port de shader/shader.vert + shader.frag (+ depth).
// Normal "flat" por derivadas de tela, Blinn-Phong, sombra PCF 5x5 e neblina.
// O original não faz correção gama nem tone mapping: ShaderMaterial também não faz (valores crus).

export const vertexPrincipal = /* glsl */ `
uniform mat4 uLightSpaceMatrix;
varying vec3 vFragPos;
varying vec3 vColor;
varying vec4 vFragPosLightSpace;

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
uniform float uAlpha;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uSpecular;
uniform float uShininess;
uniform sampler2D uShadowMap;
uniform vec2  uShadowTexel;
uniform float uShadowOn;

float calcularSombra(vec4 posLuz, vec3 normal, vec3 lDir, vec3 fragWorldPos) {
    vec3 proj = posLuz.xyz / posLuz.w;
    proj = proj * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 0.0;

    float bias = max(0.0025 * (1.0 - dot(normal, lDir)), 0.0006);

    float shadow = 0.0;
    for (int x = -2; x <= 2; ++x) {
        for (int y = -2; y <= 2; ++y) {
            float pcfDepth = texture2D(uShadowMap, proj.xy + vec2(float(x), float(y)) * uShadowTexel).r;
            shadow += (proj.z - bias > pcfDepth) ? 1.0 : 0.0;
        }
    }
    shadow /= 25.0;

    float distCam = length(fragWorldPos - cameraPosition);
    float inicioFade = 800.0;
    float fimFade = 1150.0;
    float fadeDistancia = clamp((fimFade - distCam) / (fimFade - inicioFade), 0.0, 1.0);
    return shadow * fadeDistancia;
}

void main() {
    vec3 dX = dFdx(vFragPos);
    vec3 dY = dFdy(vFragPos);
    vec3 normal = normalize(cross(dX, dY));
    vec3 lDir = normalize(uLightDir);
    vec3 viewDir = normalize(cameraPosition - vFragPos);

    vec3 ambient = uAmbient * uLightColor * vColor;

    float diff = max(dot(normal, lDir), 0.0);
    vec3 diffuse = uDiffuse * diff * uLightColor * vColor;

    vec3 halfwayDir = normalize(lDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), max(uShininess, 1.0));
    vec3 specular = uSpecular * spec * uLightColor;

    float shadow = (uShadowOn > 0.5) ? calcularSombra(vFragPosLightSpace, normal, lDir, vFragPos) : 0.0;
    shadow *= 0.60;

    vec3 result = ambient + (1.0 - shadow) * (diffuse + specular);

    vec3 corCeu = vec3(0.80, 0.85, 0.90);
    float distCam = length(cameraPosition - vFragPos);
    float fogFactor = clamp((distCam - 5000.0) / (15000.0 - 5000.0), 0.0, 1.0);
    result = mix(result, corCeu, fogFactor);

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

// Partículas: shader embutido do SistemaParticulas (MVP * pos, cor rgba direta)
export const vertexParticula = /* glsl */ `
attribute vec4 aCor;
varying vec4 vCor;
void main() {
    vCor = aCor;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
export const fragmentParticula = /* glsl */ `
varying vec4 vCor;
void main() { gl_FragColor = vCor; }
`;
