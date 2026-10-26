// game/shaders.ts
// Port de shader/shader.vert + shader/shader.frag.
// Mantém: normal "flat" por derivadas de tela, Blinn-Phong e neblina.
// A sombra (PCF 5x5) entra na Etapa de sombras — por enquanto shadow = 0.
//
// Obs.: o original NÃO faz correção gama nem tone mapping. Como ShaderMaterial não
// inclui <colorspace_fragment>/<tonemapping_fragment>, os valores saem crus, iguais ao C++.

export const vertexPrincipal = /* glsl */ `
varying vec3 vFragPos;
varying vec3 vColor;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vFragPos = worldPos.xyz;
    vColor = color;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const fragmentPrincipal = /* glsl */ `
varying vec3 vFragPos;
varying vec3 vColor;

uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform float uAlpha;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uSpecular;
uniform float uShininess;

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

    float shadow = 0.0; // TODO etapa de sombras
    shadow *= 0.60;

    vec3 result = ambient + (1.0 - shadow) * (diffuse + specular);

    vec3 corCeu = vec3(0.80, 0.85, 0.90);
    float distCam = length(cameraPosition - vFragPos);
    float fogFactor = clamp((distCam - 5000.0) / (15000.0 - 5000.0), 0.0, 1.0);
    result = mix(result, corCeu, fogFactor);

    gl_FragColor = vec4(result, uAlpha);
}
`;
