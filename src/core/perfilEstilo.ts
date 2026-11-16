// perfilEstilo.ts — "memória" das configurações de cada estilo gráfico (low poly e retro), como já existe para o carro
// vermelho e o GLB: ao trocar de estilo, tudo que o painel mexe (terreno, árvores, grama, pista, céu, luz, câmera e os
// ajustes do estilo) é guardado no estilo que sai, e o estilo que entra devolve o que tinha. Ficam FORA do perfil:
//  - o carro (já tem os perfis dele, trocados com a tecla X) e o piloto automático;
//  - `opcoes.estiloPS2` (é a própria escolha) e `opcoes.rodasVisiveis` (é do carro, vale para os dois estilos).
import type { GAME_CONFIG } from './config';

type Config = typeof GAME_CONFIG;
type Registro = Record<string, unknown>;

const FORA_DO_PERFIL = { raiz: ['carro', 'pilotoAutomaticoOn'], opcoes: ['estiloPS2', 'rodasVisiveis'] };

/** cópia independente das configurações que pertencem ao estilo gráfico */
export function tirarPerfilEstilo(cfg: Config): Registro {
    const perfil: Registro = {};
    for (const [chave, valor] of Object.entries(cfg)) {
        if (FORA_DO_PERFIL.raiz.includes(chave)) continue;
        const copia = structuredClone(valor) as unknown;
        if (chave === 'opcoes') for (const k of FORA_DO_PERFIL.opcoes) delete (copia as Registro)[k];
        perfil[chave] = copia;
    }
    return perfil;
}

const ehObjeto = (v: unknown): v is Registro => typeof v === 'object' && v !== null && !Array.isArray(v);

/** copia os valores do perfil para dentro de `destino`, mantendo os OBJETOS do config (o resto do jogo guarda referências a eles) */
function mesclar(destino: Registro, origem: Registro) {
    for (const [k, v] of Object.entries(origem)) {
        if (ehObjeto(v) && ehObjeto(destino[k])) mesclar(destino[k] as Registro, v);
        else destino[k] = structuredClone(v);
    }
}

export function aplicarPerfilEstilo(cfg: Config, perfil: Registro) {
    mesclar(cfg as unknown as Registro, structuredClone(perfil));
}
