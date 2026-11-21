import { Suspense } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../public/locales/en.json';
import et from '../../../../public/locales/et.json';
import fun from '../../../../public/locales/fun.json';

// The texts come from the locale files instead of over HTTP
vi.mock('i18next-http-backend', () => ({
    default: class {
        static type = 'backend';
        type = 'backend';
        init() {}
        read(language: string, _ns: string, done: (err: unknown, data: unknown) => void) {
            done(null, ({ en, et, fun } as Record<string, unknown>)[language]);
        }
    },
}));

const Changelog = () => <p data-testid="text">{useTranslation().t('changelog')}</p>;

// A fresh i18n with what the browser has saved, like a page load
const loadApp = async (saved: string | null) => {
    vi.resetModules();
    localStorage.clear();
    if (saved) localStorage.setItem('language', saved);

    const { default: i18n } = await import('../../../i18n');
    const { default: LanguageSelector } = await import('./LanguageSelector');
    await act(async () => {
        render(
            <Suspense fallback={null}>
                <LanguageSelector />
                <Changelog />
            </Suspense>
        );
    });
    await screen.findByTestId('text');
    return i18n;
};

describe('LanguageSelector', () => {
    beforeEach(() => localStorage.clear());

    it('starts in the saved language', async () => {
        await loadApp('et');
        expect(screen.getByTestId('text')).toHaveTextContent('Muudatuste logi');
        expect(screen.getByText('Eesti').className).toMatch(/active/);
    });

    it('starts in English when nothing or something unknown is saved', async () => {
        await loadApp('xx');
        expect(screen.getByTestId('text')).toHaveTextContent('Changelog');
        expect(screen.getByText('English').className).toMatch(/active/);
    });

    // Issue 41: the first click after a page load in Estonian was undone
    it('switches and saves the language on the first click', async () => {
        const i18n = await loadApp('et');

        await act(async () => {
            fireEvent.click(screen.getByText('English'));
        });

        expect(screen.getByTestId('text')).toHaveTextContent('Changelog');
        expect(screen.getByText('English').className).toMatch(/active/);
        expect(localStorage.getItem('language')).toBe('en');
        expect(i18n.language).toBe('en');
    });
});
