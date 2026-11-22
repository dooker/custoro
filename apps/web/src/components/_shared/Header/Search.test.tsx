import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounceTimer } from '../../../variables';
import { Search } from './Search';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

const type = (word: string) =>
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: word } });

const wait = (ms = debounceTimer) => act(() => vi.advanceTimersByTime(ms));

describe('Search', () => {
    it('sends the word once typing pauses', () => {
        const onChange = vi.fn();
        render(<Search value="" onChange={onChange} />);

        fireEvent.click(screen.getByTestId('search-button'));
        type('orb');
        wait();

        expect(onChange).toHaveBeenLastCalledWith('orb');
    });

    // Copilot review of PR 46: typing a search and opening a row at once moved the user back to the
    // list 350 ms later
    it('sends nothing once the search box is gone', () => {
        const onChange = vi.fn();
        const { unmount } = render(<Search value="" onChange={onChange} />);

        fireEvent.click(screen.getByTestId('search-button'));
        onChange.mockClear();
        type('orb');
        unmount();
        wait();

        expect(onChange).not.toHaveBeenCalled();
    });
});
