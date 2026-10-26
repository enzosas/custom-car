// Terreno.tsx — componente R3F que desenha a malha de game/Terreno.ts
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Terreno as TerrenoData } from './game/Terreno';
import { criarMaterialPrincipal } from './game/materialPrincipal';

// cor sólida da grama: glm::vec3 corSolidaGrama(0.34f, 0.7f, 0.56f)
const COR_GRAMA = [0.34, 0.7, 0.56];

export function Terreno({ onPronto }: { onPronto?: (t: TerrenoData) => void }) {
    const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
    const material = useMemo(() => criarMaterialPrincipal(), []);

    useEffect(() => {
        let cancelado = false;
        fetch('/terreno.raw')
            .then((r) => { if (!r.ok) throw new Error('terreno.raw não encontrado em /public'); return r.arrayBuffer(); })
            .then((buf) => {
                if (cancelado) return;
                const t = new TerrenoData();
                t.carregarRaw(buf);

                const pos = t.gerarPosicoes();
                const cores = new Float32Array(pos.length);
                for (let i = 0; i < pos.length; i += 3) {
                    cores[i] = COR_GRAMA[0]; cores[i + 1] = COR_GRAMA[1]; cores[i + 2] = COR_GRAMA[2];
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
                geo.setIndex(new THREE.BufferAttribute(t.gerarIndices(), 1));
                geo.computeBoundingSphere();
                setGeometry(geo);
                onPronto?.(t);
            })
            .catch((e) => console.error('Erro ao gerar terreno:', e));
        return () => { cancelado = true; };
    }, [onPronto]);

    if (!geometry) return null;
    // frustumCulled=false: o terreno é um único mesh enorme (igual ao C++, que não faz culling)
    return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
