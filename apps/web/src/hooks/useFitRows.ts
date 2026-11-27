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
import { useDebounce } from './useDebounce';

// A resize settles before the list asks for other rows (dragging a window edge fires many events)
const resizeWait = 150;

const height = (element: Element | null | undefined): number | undefined => {
    const value = element?.getBoundingClientRect().height;

    return value || undefined;
};

/** A row's height: the average of the rows drawn, so one taller row does not decide it */
const rowHeight = (table: HTMLTableElement | null): number | undefined => {
    const heights = [...(table?.querySelectorAll('tbody tr') ?? [])]
        .map((row) => row.getBoundingClientRect().height)
        .filter((value) => value > 0);

    return heights.length
        ? heights.reduce((sum, value) => sum + value, 0) / heights.length
        : undefined;
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
        row: rowHeight(table),
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
    // The page and page size of the rows on screen (ListFrame, from the answer shown): while the
    // next page loads they are still the page before's
    show: (rows: ShownRowsIF | undefined) => void;
}

export interface ShownRowsIF {
    page?: number;
    limit?: number;
    // The list and search they belong to: the address of its first page
    list?: string;
}

/**
 * A page of a list shows as many rows as fit on the screen, and again after the window is
 * resized. Then the address moves to the page that still shows the first row the user saw.
 */
export const useFitRows = (page: number, pageHref: (page: number) => string): FitRowsIF => {
    const ref = useRef<HTMLElement | null>(null);
    const navigate = useNavigate();
    const [size, setSize] = useState<number | null>(null);
    // The newest values, so `fit` stays one function for the list's life: the router's navigate
    // changes with every page's address, and with it the observer and the resize listener did
    const latestRef = useRef({ page, pageHref, size, navigate });
    const shownRef = useRef<ShownRowsIF | undefined>(undefined);
    // A window resize is settling (resizeWait): layout changes then wait for it
    const resizingRef = useRef(false);

    useLayoutEffect(() => {
        latestRef.current = { page, pageHref, size, navigate };
    });

    // After a resize the address moves to the page with the first row the user saw. The first
    // measurements (before and after the rows are drawn) only settle the size: the page in the
    // address is the one asked for.
    const fit = useCallback((keepRow: boolean) => {
        const section = ref.current;

        if (!section) {
            return;
        }

        const next = measureList(section);
        const { page: shown, pageHref: href, size: before, navigate: go } = latestRef.current;

        if (next === before) {
            return;
        }

        latestRef.current = { ...latestRef.current, size: next };

        // The first row the user sees: of the rows on screen, which are still the page before's
        // while the next page loads (Copilot review of PR 47), else of the page asked for. Rows
        // of another list or search (a new search loading) say nothing about this one's pages
        // (round 2).
        const onScreen = shownRef.current?.list === href(1) ? shownRef.current : undefined;
        const fromPage = onScreen?.page ?? shown;
        const fromSize = onScreen?.limit ?? before;

        // The router moves pages in a transition: the size goes in the same one, so both land
        // in one render and the list asks only for the new page with the new size
        startTransition(() => {
            if (keepRow && fromSize) {
                const target = pageKeepingRow(fromPage, fromSize, next);

                if (target !== shown) {
                    void go(href(target), { replace: true });
                }
            }

            setSize(next);
        });
    }, []);
    const measure = useCallback(() => fit(false), [fit]);
    const show = useCallback((rows: ShownRowsIF | undefined) => {
        shownRef.current = rows;
    }, []);

    // The layout can change without a resize: the page header gets higher when a customer's name
    // arrives in the title, the footer when the page numbers appear and wrap. The list is measured
    // again then, without moving the page (Copilot review of PR 47). Measuring again when nothing
    // changed costs nothing: the size stays and no request is made.
    useEffect(() => {
        const section = ref.current;

        if (typeof ResizeObserver === 'undefined' || !section) {
            return;
        }

        const observer = new ResizeObserver(() => {
            // A window resize is handled once it settles, keeping the first row seen
            if (!resizingRef.current) {
                fit(false);
            }
        });

        // The list (its rows and footer) and the page header above it
        observer.observe(section);

        if (section.previousElementSibling) {
            observer.observe(section.previousElementSibling);
        }

        return () => observer.disconnect();
    }, [fit]);

    const settle = useDebounce(
        () => {
            resizingRef.current = false;
            fit(true);
        },
        resizeWait,
        { cancelOnUnmount: true }
    );

    useEffect(() => {
        const onResize = () => {
            resizingRef.current = true;
            settle();
        };

        window.addEventListener('resize', onResize);

        return () => {
            resizingRef.current = false;
            window.removeEventListener('resize', onResize);
        };
    }, [settle]);

    return { size, ref, measure, show };
};
