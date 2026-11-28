import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no matchMedia, and the layout is mobile first (useMediaQuery answers "a phone" without
// it). This one answers min-width and max-width from window.innerWidth: jsdom's 1024 is a wide
// screen, and a test sets window.innerWidth = 375 to be a phone.
const widthMatches = (query: string): boolean =>
    [...query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].every(([, side, px]) =>
        side === 'min' ? window.innerWidth >= Number(px) : window.innerWidth <= Number(px)
    );

// Not in a test that runs in Node's environment (changelogFile.test.ts)
if (typeof window !== 'undefined') {
    window.matchMedia = (query: string): MediaQueryList => ({
        media: query,
        matches: widthMatches(query),
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    });
}

// Automatically unmounts React trees after each test to prevent memory leaks
afterEach(() => {
    cleanup();
});
