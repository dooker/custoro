import { useCallback, useEffect, useRef } from 'react';

interface DebounceOptionsIF {
    // Drop a call still waiting when the component is gone. A search box wants this (it must not
    // move the user back to a list they left); a form's autosave does not (it saves what was
    // typed just before leaving).
    cancelOnUnmount?: boolean;
}

/**
 * A function that calls `callback` once typing pauses for `delay` ms, with the last arguments.
 * It calls the newest `callback`, so a waiting call uses the current state (the list's page size,
 * the form's other fields), not the state of the render it was made in.
 */
export const useDebounce = <T extends Array<unknown>>(
    callback: (...args: T) => void,
    delay: number,
    { cancelOnUnmount = false }: DebounceOptionsIF = {}
) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const latestRef = useRef(callback);

    useEffect(() => {
        latestRef.current = callback;
    });

    useEffect(
        () => () => {
            if (cancelOnUnmount && timerRef.current !== undefined) {
                clearTimeout(timerRef.current);
            }
        },
        [cancelOnUnmount]
    );

    return useCallback(
        (...args: T) => {
            if (timerRef.current !== undefined) {
                clearTimeout(timerRef.current);
            }

            timerRef.current = setTimeout(() => {
                timerRef.current = undefined;
                latestRef.current(...args);
            }, delay);
        },
        [delay]
    );
};
