import { describe, expect, it } from 'vitest';
import { boldLead, boldLeads, sectionKind, splitChangeLog } from './releases';

const changelog = `# Changelog

All notable changes to Custoro.

## Unreleased

## 5.0.0 - 2026-11-14

### Added

- A server bundle

### Fixed

- The login

## 4.0.0 - 2026-10-02

### Changed

- Everything

## Pre-monorepo history

- Older work
`;

describe('splitChangeLog', () => {
    it('drops the file heading and keeps the intro', () => {
        expect(splitChangeLog(changelog).intro).toBe('All notable changes to Custoro.');
    });

    it('gives one release per ## heading, with the date apart', () => {
        const { releases } = splitChangeLog(changelog);
        expect(releases.map(({ version, date }) => [version, date])).toEqual([
            ['5.0.0', '2026-11-14'],
            ['4.0.0', '2026-10-02'],
            ['Pre-monorepo history', undefined],
        ]);
        expect(releases[0].body).toBe('### Added\n\n- A server bundle\n\n### Fixed\n\n- The login');
    });

    it('leaves out a release without entries, such as an empty Unreleased', () => {
        expect(splitChangeLog(changelog).releases.map((r) => r.version)).not.toContain(
            'Unreleased'
        );
    });

    it('keeps Unreleased when it has entries', () => {
        const withEntries = changelog.replace('## Unreleased\n', '## Unreleased\n\n- Next thing\n');
        expect(splitChangeLog(withEntries).releases[0]).toEqual({
            version: 'Unreleased',
            body: '- Next thing',
        });
    });

    it('reads Windows line endings', () => {
        expect(splitChangeLog(changelog.replace(/\n/g, '\r\n')).releases).toHaveLength(3);
    });

    it('does not split on a ## inside an entry', () => {
        const inline = changelog.replace('- The login', '- The login, see ## below');
        expect(splitChangeLog(inline).releases).toHaveLength(3);
    });
});

describe('boldLead', () => {
    it('sets the text up to the first colon in bold', () => {
        expect(boldLead('- Production without Docker: every release now also has a bundle')).toBe(
            '- **Production without Docker:** every release now also has a bundle'
        );
    });

    it('takes the first sentence when it comes first', () => {
        expect(boldLead('- Every image knows which build it is. `docker-build.sh` names it')).toBe(
            '- **Every image knows which build it is.** `docker-build.sh` names it'
        );
    });

    it('never cuts inside inline code', () => {
        expect(boldLead('- API answers carry `Cache-Control: no-store`: nothing is cached')).toBe(
            '- **API answers carry `Cache-Control: no-store`:** nothing is cached'
        );
        expect(boldLead('- Uses `scripts/x.sh. y` now. Then more')).toBe(
            '- **Uses `scripts/x.sh. y` now.** Then more'
        );
    });

    it('leaves an entry alone when its lead would be long', () => {
        const long = `- ${'word '.repeat(40)}and only then: the rest`;
        expect(boldLead(long)).toBe(long);
    });

    it('leaves an entry alone that has no lead or is already bold', () => {
        expect(boldLead('- A short entry without a stop')).toBe('- A short entry without a stop');
        expect(boldLead('- **Breaking:** something')).toBe('- **Breaking:** something');
    });

    it('does not take a dot inside a word or a number for a sentence end', () => {
        expect(boldLead('- Node 24.1 and Zone.ee work: yes')).toBe(
            '- **Node 24.1 and Zone.ee work:** yes'
        );
    });
});

describe('boldLeads', () => {
    it('touches only the top-level entries', () => {
        expect(boldLeads('### Added\n\n- First: one\n  wrapped line: no\n- Second. two')).toBe(
            '### Added\n\n- **First:** one\n  wrapped line: no\n- **Second.** two'
        );
    });
});

describe('sectionKind', () => {
    it('knows the four sections, whatever the case', () => {
        expect(['Added', 'Security', 'FIXED', ' Changed '].map(sectionKind)).toEqual([
            'added',
            'security',
            'fixed',
            'changed',
        ]);
    });

    it('shows any other heading plain', () => {
        expect(sectionKind('Removed')).toBe('other');
    });
});
