import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import en from '../../../public/locales/en.json';
import et from '../../../public/locales/et.json';
import fun from '../../../public/locales/fun.json';
import { renderScreen } from '../../test/renderScreen';
import PageNotFound from './PageNotFound';

describe('PageNotFound', () => {
    it('tells its story in the language of the app, one line at a time', () => {
        renderScreen(<PageNotFound />, { path: '/nowhere/' });

        expect(screen.getByText("There's been a...complication.")).toBeInTheDocument();
        expect(screen.getByText("it's not there.")).toBeInTheDocument();
        expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    });

    // The page was English only: every language has the story, line for line
    it('has the story in every language, with the same lines', () => {
        const lines = (texts: { modal: { notFound: { story: string } } }) =>
            texts.modal.notFound.story.split('\n').length;

        expect(lines(en)).toBe(7);
        expect(lines(et)).toBe(lines(en));
        expect(lines(fun)).toBe(lines(en));
        expect(et.modal.notFound.story).toContain('komplikatsioon');
    });
});
