import {
    startTransition,
    type RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { useNavigate } from 'react-router';
import { fitRows, pageKeepingRow } from '../components/_shared/List/listLogic';

// A resize settles before the list asks for other rows (dragging a window edge fires many events)
const resizeWait = 150;

const height = (element: Element | null | undefined): number | undefined => {
    const value = element?.getBoundingClientRect().height;

    return value ? value : undefined;
};

/** The space of a list on the screen, measured from its section (ListFrame) */
const measureList = (section: HTMLElement) => {
    const table = section.querySelector('table');
    // Before the first rows there is no table yet: it starts under the section's top border
    const top = table
        ? table.getBoundingClientRect().top
        : section.getBoundingClientRect().top + section.clientTop;
    const below = parseFloat(getComputedStyle(section).marginBottom);

    return fitRows({
        viewport: window.innerHeight,
        top: top + window.scrollY,
        head: height(table?.querySelector('thead')),
        row: height(table?.querySelector('tbody tr')),
        footer: height(section.querySelector('[data-list-footer]')),
        below: Number.isNaN(below) ? undefined : below,
    });
};

export interface FitRowsIF {
    // The rows a page: null until the list's place on the screen is measured
    size: number | null;
    // The list's section (ListFrame), and measuring it again once the first rows are drawn
    ref: RefObject<HTMLElement | null>;
    measure: () => void;
}

/**
 * A page of a list shows as many rows as fit on the screen, and again after the window is
 * resized. Then the address moves to the page that still shows the first row the user saw.
 */
export const useFitRows = (page: number, pageHref: (page: number) => string): FitRowsIF => {
    const ref = useRef<HTMLElement | null>(null);
    const navigate = useNavigate();
    const [size, setSize] = useState<number | null>(null);
    const latestRef = useRef({ page, pageHref, size });

    useLayoutEffect(() => {
        latestRef.current = { page, pageHref, size };
    });

    // After a resize the address moves to the page with the first row the user saw. The first
    // measurements (before and after the rows are drawn) only settle the size: the page in the
    // address is the one asked for.
    const fit = useCallback(
        (keepRow: boolean) => {
            const section = ref.current;

            if (!section) {
                return;
            }

            const next = measureList(section);
            const { page: shown, pageHref: href, size: before } = latestRef.current;

            if (next === before) {
                return;
            }

            latestRef.current = { ...latestRef.current, size: next };

            // The router moves pages in a transition: the size goes in the same one, so both land
            // in one render and the list asks only for the new page with the new size
            startTransition(() => {
                if (keepRow && before && shown > 1) {
                    const target = pageKeepingRow(shown, before, next);

                    if (target !== shown) {
                        void navigate(href(target), { replace: true });
                    }
                }

                setSize(next);
            });
        },
        [navigate]
    );
    const measure = useCallback(() => fit(false), [fit]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onResize = () => {
            clearTimeout(timer);
            timer = setTimeout(() => fit(true), resizeWait);
        };

        window.addEventListener('resize', onResize);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', onResize);
        };
    }, [fit]);

    return { size, ref, measure };
};
