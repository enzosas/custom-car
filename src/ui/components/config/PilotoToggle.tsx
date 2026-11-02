import { useState } from 'react';
import { TabButton } from './TabButton';
import type { ModoPainel } from './tipos';

interface Props {
    config: { pilotoAutomaticoOn: boolean };
    modo: ModoPainel;
    onAlterado: () => void;
}

export function PilotoToggle({ config, modo, onAlterado }: Props) {
    const [ligado, setLigado] = useState(config.pilotoAutomaticoOn);

    const alternar = () => {
        config.pilotoAutomaticoOn = !config.pilotoAutomaticoOn;
        setLigado(config.pilotoAutomaticoOn);
        onAlterado();
    };

    return <TabButton texto={`piloto auto: ${ligado ? 'on' : 'off'}`} modo={modo} onClick={alternar} />;
}
