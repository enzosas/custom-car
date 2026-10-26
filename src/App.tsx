// App.tsx — Etapa 1: cena base (céu, luz/shader, terreno) com câmera livre para validação
import { useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Terreno } from './Terreno';
import type { Terreno as TerrenoData } from './game/Terreno';

// glClearColor(0.8, 0.85, 0.9): valor cru na tela. setRGB com sRGB evita a conversão de saída.
const COR_CEU = new THREE.Color().setRGB(0.8, 0.85, 0.9, THREE.SRGBColorSpace);

export default function App() {
    const [terreno, setTerreno] = useState<TerrenoData | null>(null);
    const onPronto = useCallback((t: TerrenoData) => {
        setTerreno(t);
        // valores de referência para comparar com o C++ (veja a explicação no chat)
        console.log('altura(0,0)       =', t.obterAlturaMundo(0, 0));
        console.log('altura(1000,-2000)=', t.obterAlturaMundo(1000, -2000));
        console.log('altura(-5000,3000)=', t.obterAlturaMundo(-5000, 3000));
    }, []);

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <Canvas
                flat /* sem tone mapping, igual ao OpenGL cru */
                camera={{ position: [0, 700, -1500], fov: 60, near: 0.3, far: 15000 }}
            >
                <color attach="background" args={[COR_CEU.r, COR_CEU.g, COR_CEU.b]} />
                <OrbitControls makeDefault target={[0, 100, 0]} />
                <Terreno onPronto={onPronto} />
            </Canvas>
            <div style={{ position: 'absolute', top: 8, left: 8, color: '#000', font: '12px monospace' }}>
                Etapa 1 — terreno {terreno ? `${terreno.larguraGrid}x${terreno.profundidadeGrid}` : 'carregando...'}
            </div>
        </div>
    );
}
