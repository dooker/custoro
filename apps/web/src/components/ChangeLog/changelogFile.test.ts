// @vitest-environment node
// (reads a file from the repository; jsdom would make import.meta.url an http: address)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';
import { boldLeads, sectionKind, splitChangeLog } from './releases';

// The repository's own CHANGELOG.md, the file the page shows: a heading or a section written in
// a way the page cannot show fails here instead of on the live changelog page
const file = readFileSync(new URL('../../../../../CHANGELOG.md', import.meta.url), 'utf8');
const { intro, releases } = splitChangeLog(file);
const versioned = releases.filter((release) => release.date);

describe('CHANGELOG.md as the changelog page reads it', () => {
    it('has an intro and releases, each with entries', () => {
        expect(intro).not.toBe('');
        expect(versioned.length).toBeGreaterThan(0);
        for (const release of releases) {
            expect(release.body, release.version).not.toBe('');
        }
    });

    it('starts with the version the apps have, or with Unreleased entries before it', () => {
        expect(versioned[0].version).toBe(packageJson.version);
        expect(releases[0] === versioned[0] || releases[0].version === 'Unreleased').toBe(true);
    });

    it('dates every release as version - YYYY-MM-DD, newest first', () => {
        for (const release of versioned) {
            expect(release.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
        }
        const dates = versioned.map((release) => release.date!);
        expect(dates).toEqual([...dates].sort().reverse());
    });

    it('uses only Added, Security, Fixed and Changed in the versioned releases', () => {
        for (const release of versioned) {
            const sections = [...release.body.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
            expect(sections.length, release.version).toBeGreaterThan(0);
            expect(sections.map(sectionKind), release.version).not.toContain('other');
        }
    });

    it('gives most entries of the newest release a bold lead', () => {
        const entries = versioned[0].body.split('\n').filter((line) => line.startsWith('- '));
        const bold = boldLeads(versioned[0].body)
            .split('\n')
            .filter((line) => line.startsWith('- **'));
        expect(entries.length).toBeGreaterThan(0);
        expect(bold.length).toBeGreaterThanOrEqual(Math.ceil(entries.length / 2));
    });
});
