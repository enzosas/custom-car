import { useEffect, useState } from 'react';

export const isMobileDevice = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    window.innerWidth <= 800;

/** Reage a resize sem que o motor do jogo precise ser recriado. */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(isMobileDevice);

    useEffect(() => {
        const aoRedimensionar = () => setIsMobile(isMobileDevice());
        window.addEventListener('resize', aoRedimensionar);
        return () => window.removeEventListener('resize', aoRedimensionar);
    }, []);

    return isMobile;
}
