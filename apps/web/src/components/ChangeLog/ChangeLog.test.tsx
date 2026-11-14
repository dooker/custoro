import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../test/renderScreen';
import ChangeLog from './ChangeLog';

// The header needs the logged-in app around it; this test is about the page's content
vi.mock('../_shared/Header/Header', () => ({ default: () => null }));

const changelog = `# Changelog

All notable changes to Custoro.

## Unreleased

## 5.0.1 - 2026-11-14

### Fixed

- The changelog page is readable: it was one run of plain lines

## 5.0.0 - 2026-11-14

### Added

- Production without Docker: every release has a bundle

### Security

- Settings can only be changed by admins. Any user could before

## Pre-monorepo history

### API

- Older work
`;

const fetchMock = vi.fn();

const serve = (text: string) =>
    fetchMock.mockResolvedValue({ text: () => Promise.resolve(text) } as Response);

const renderChangeLog = () => renderScreen(<ChangeLog />, { path: '/changelog/' });

// A release's <details> block, found by its version
const release = async (version: string) =>
    (await screen.findByText(version, { selector: 'summary span' })).closest('details')!;

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    serve(changelog);
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

describe('ChangeLog', () => {
    it('shows each release with its date, the newest open', async () => {
        renderChangeLog();

        const newest = await release('5.0.1');
        expect(within(newest).getByText('2026-11-14')).toHaveAttribute('datetime', '2026-11-14');
        expect(newest).toHaveAttribute('open');
        expect(await release('5.0.0')).not.toHaveAttribute('open');
        expect(await release('Pre-monorepo history')).not.toHaveAttribute('open');
    });

    it('leaves out an Unreleased without entries and the file heading', async () => {
        renderChangeLog();

        await release('5.0.1');
        expect(screen.queryByText('Unreleased')).not.toBeInTheDocument();
        expect(screen.queryByText('Changelog')).not.toBeInTheDocument();
        expect(screen.getByText('All notable changes to Custoro.')).toBeInTheDocument();
    });

    it('labels the sections by their kind', async () => {
        renderChangeLog();

        const labels = within(await release('5.0.0')).getAllByRole('heading', { level: 3 });
        expect(labels.map((label) => [label.textContent, label.className])).toEqual([
            ['Added', expect.stringMatching(/added/)],
            ['Security', expect.stringMatching(/security/)],
        ]);
        const other = within(await release('Pre-monorepo history')).getByRole('heading', {
            level: 3,
        });
        expect(other.className).toMatch(/other/);
    });

    it('shows the entries as a list with their lead in bold', async () => {
        renderChangeLog();

        const entries = within(await release('5.0.0')).getAllByRole('listitem');
        expect(entries).toHaveLength(2);
        expect(within(entries[0]).getByText('Production without Docker:').tagName).toBe('STRONG');
        expect(
            within(entries[1]).getByText('Settings can only be changed by admins.').tagName
        ).toBe('STRONG');
    });

    it('cancels the request when the page is left before it arrives', async () => {
        fetchMock.mockReturnValue(new Promise(() => {}));
        const { unmount } = renderChangeLog();

        const { signal } = fetchMock.mock.calls[0][1] as RequestInit;
        expect(fetchMock).toHaveBeenCalledWith('/CHANGELOG.md', expect.anything());
        expect(signal?.aborted).toBe(false);
        unmount();
        expect(signal?.aborted).toBe(true);
    });
});
