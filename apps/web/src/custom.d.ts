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

// Injected by vite.config.ts: the version from package.json, the commit and time of the build
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
declare const __APP_BUILT_AT__: string;
