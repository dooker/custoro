import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SafeHtml from './SafeHtml';

describe('SafeHtml', () => {
    it('draws the markup of a text', () => {
        const { container } = render(
            <SafeHtml className="error" html="Delete this <span>customer</span>?" />
        );

        expect(container.querySelector('div.error span')).toHaveTextContent('customer');
    });

    it('drops scripts and event handlers', () => {
        const { container } = render(
            <SafeHtml html={'<img src="x" onerror="alert(1)"><script>alert(2)</script>ok'} />
        );

        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('img')).not.toHaveAttribute('onerror');
        expect(container).toHaveTextContent('ok');
    });
});
