import { useState } from 'react';
import { TabButton } from './TabButton';
import type { ModoPainel } from './tipos';
import { useSinal } from '../../hooks/useSinal';

interface Props {
    config: { pilotoAutomaticoOn: boolean };
    modo: ModoPainel;
    onAlterado: () => void;
    /** cursor do teclado neste botão; `acionar` muda a cada L (liga/desliga) */
    cursor?: boolean;
    acionar?: number;
}

export function PilotoToggle({ config, modo, onAlterado, cursor = false, acionar = 0 }: Props) {
    const [ligado, setLigado] = useState(config.pilotoAutomaticoOn);

    const alternar = () => {
        config.pilotoAutomaticoOn = !config.pilotoAutomaticoOn;
        setLigado(config.pilotoAutomaticoOn);
        onAlterado();
    };

    useSinal(acionar, cursor, alternar);

    return <TabButton texto={`piloto auto: ${ligado ? 'on' : 'off'}`} modo={modo} cursor={cursor} onClick={alternar} />;
}
