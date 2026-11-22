import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Header from './Header';

// Copilot review of PR 46: the company page marked its Save and Switch buttons with a "disabled"
// class while a request ran, which stops the mouse (pointer-events) but not Enter or Space on a
// focused button, so a second request could start before the first one answered.
describe('Header buttons', () => {
    it('a disabled button is disabled for the keyboard too, not only greyed', () => {
        const onClick = vi.fn();
        render(
            <Header
                title="Company"
                buttons={[{ label: 'button.save', onClick, disabled: true, dataTestId: 'save' }]}
            />
        );

        const save = screen.getByTestId('save');

        expect(save).toBeDisabled();
        fireEvent.click(save);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('takes the old "disabled" class as disabled as well', () => {
        render(
            <Header
                title="Company"
                buttons={[
                    { label: 'button.save', classname: 'primary disabled', dataTestId: 'save' },
                ]}
            />
        );

        expect(screen.getByTestId('save')).toBeDisabled();
    });

    it('leaves the other buttons as they are', () => {
        const onClick = vi.fn();
        render(
            <Header
                title="Company"
                buttons={[{ label: 'button.save', onClick, dataTestId: 'save' }]}
            />
        );

        fireEvent.click(screen.getByTestId('save'));
        expect(screen.getByTestId('save')).toBeEnabled();
        expect(onClick).toHaveBeenCalledOnce();
    });
});
