import { act } from '@testing-library/react';
import { listHeights } from '../components/_shared/List/listLogic';

// jsdom draws nothing, so a list measures its own heights (listHeights) from the top of the window:
// a window this high fits `rows` rows
export const windowFor = (rows: number) =>
    listHeights.head + listHeights.footer + listHeights.below + rows * listHeights.row + 1;

/** The window resized to fit `rows` rows, and the resize settled (useFitRows waits 150 ms) */
export const resizeTo = async (rows: number) => {
    await act(async () => {
        window.innerHeight = windowFor(rows);
        window.dispatchEvent(new Event('resize'));
        await new Promise((resolve) => setTimeout(resolve, 200));
    });
};
