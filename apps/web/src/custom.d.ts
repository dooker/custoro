declare module '*.svg' {
    import React from 'react';
    export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
    const src: string;
    export default src;
}

declare module '*.webp' {
    const src: string;
    export default src;
}

declare module '*.pdf' {
    const src: string;
    export default src;
}

declare module 'crypto-js';

// Injected by vite.config.ts from package.json
declare const __APP_VERSION__: string;
