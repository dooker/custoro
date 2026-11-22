import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounce } from './useDebounce';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useDebounce', () => {
    it('calls once, with the last arguments, after the pause', () => {
        const callback = vi.fn();
        const { result } = renderHook(() => useDebounce(callback, 350));

        result.current('a');
        result.current('ab');
        vi.advanceTimersByTime(349);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(callback).toHaveBeenCalledExactlyOnceWith('ab');
    });

    // Copilot review of PR 46: a search typed just before the page size changed was sent with the
    // old size, because the timer called the callback of the render it was started in
    it('calls the newest callback, not the one of the render the call was made in', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender } = renderHook(({ callback }) => useDebounce(callback, 350), {
            initialProps: { callback: first },
        });

        result.current('a');
        rerender({ callback: second });
        vi.advanceTimersByTime(350);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledExactlyOnceWith('a');
    });

    // Copilot review of PR 46: a search typed just before opening a row navigated back to the
    // list 350 ms later, from a search box that was gone
    it('drops a waiting call when the component is gone, when asked to', () => {
        const callback = vi.fn();
        const { result, unmount } = renderHook(() =>
            useDebounce(callback, 350, { cancelOnUnmount: true })
        );

        result.current('a');
        unmount();
        act(() => vi.advanceTimersByTime(350));

        expect(callback).not.toHaveBeenCalled();
    });

    // A form's autosave still saves what was typed just before leaving it
    it('keeps a waiting call after the component is gone by default', () => {
        const callback = vi.fn();
        const { result, unmount } = renderHook(() => useDebounce(callback, 350));

        result.current('a');
        unmount();
        act(() => vi.advanceTimersByTime(350));

        expect(callback).toHaveBeenCalledExactlyOnceWith('a');
    });
});
