import { RefObject, useEffect } from 'react';

interface OutsideAlerterIF {
    ref: RefObject<HTMLDivElement>;
    callback: () => void;
}

export const useOutsideAlerter = ({ ref, callback }: OutsideAlerterIF) => {
    useEffect(() => {
        const handleClickOutside = (event: Event) => {
            if (ref && ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [ref, callback]);
};
