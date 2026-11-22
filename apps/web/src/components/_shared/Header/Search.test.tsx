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

    // Copilot review of PR 46: after paging through search A, changing it to B and going Back, the
    // list showed A while the box still said B
    describe('follows the address', () => {
        it('shows the word of the address after Back or Forward', () => {
            const { rerender } = render(<Search value="a" onChange={vi.fn()} />);
            expect(screen.getByTestId('search-input')).toHaveValue('a');

            rerender(<Search value="b" onChange={vi.fn()} />);

            expect(screen.getByTestId('search-input')).toHaveValue('b');
        });

        it('closes the box when the address has no word any more', () => {
            const { rerender } = render(<Search value="a" onChange={vi.fn()} />);

            rerender(<Search value="" onChange={vi.fn()} />);

            expect(screen.queryByTestId('search-input')).not.toBeInTheDocument();
        });

        it('opens the box when the address gets a word', () => {
            const { rerender } = render(<Search value="" onChange={vi.fn()} />);

            rerender(<Search value="orb" onChange={vi.fn()} />);

            expect(screen.getByTestId('search-input')).toHaveValue('orb');
        });

        it('keeps newer typing when its own earlier word comes back', () => {
            const onChange = vi.fn();
            const { rerender } = render(<Search value="" onChange={onChange} />);

            fireEvent.click(screen.getByTestId('search-button'));
            type('abc');
            wait();
            expect(onChange).toHaveBeenLastCalledWith('abc');

            type('abcd');
            rerender(<Search value="abc" onChange={onChange} />);

            expect(screen.getByTestId('search-input')).toHaveValue('abcd');
        });

        it('drops a word still waiting when the address changes elsewhere', () => {
            const onChange = vi.fn();
            const { rerender } = render(<Search value="a" onChange={onChange} />);

            type('xy');
            rerender(<Search value="b" onChange={onChange} />);
            wait();

            expect(onChange).not.toHaveBeenCalledWith('xy');
            expect(screen.getByTestId('search-input')).toHaveValue('b');
        });
    });
});
