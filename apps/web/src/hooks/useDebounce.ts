import { useRef } from 'react';

export const useDebounce = <T extends Array<unknown>>(
    callback: (...args: T) => void,
    delay: number
) => {
    // We use ReturnType<typeof setTimeout> to capture whatever the environment provides.
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    return (...args: T) => {
        if (timer.current !== undefined) {
            // We cast to any ONLY within the context of the internal browser call
            // to bridge the gap between Node and DOM types, while keeping
            // the hook's external interface 100% type-safe.
            // OR, preferably, use the 'as' cast below:
            clearTimeout(timer.current as unknown as number);
        }

        timer.current = setTimeout(() => {
            callback(...args);
        }, delay);
    };
};
