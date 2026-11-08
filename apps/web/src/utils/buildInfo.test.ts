import { describe, expect, it } from 'vitest';
import { releaseName, resolveBuild, resolveBuiltAt, versionLabel } from './buildInfo';

describe('resolveBuild', () => {
    const noGit = () => {
        throw new Error('not a git repository');
    };

    it('takes the commit the Docker build was given first', () => {
        expect(resolveBuild('38bdbcb', () => 'aaaaaaa')).toBe('38bdbcb');
        expect(resolveBuild(' 38bdbcb-dirty\n', noGit)).toBe('38bdbcb-dirty');
    });

    it("else the checkout's own commit", () => {
        expect(resolveBuild(undefined, () => 'f7d71f5\n')).toBe('f7d71f5');
        expect(resolveBuild('', () => 'f7d71f5-dirty')).toBe('f7d71f5-dirty');
    });

    it('is unknown without either, and for anything that is not a commit', () => {
        expect(resolveBuild(undefined, noGit)).toBe('unknown');
        expect(resolveBuild(undefined, () => null)).toBe('unknown');
        expect(resolveBuild('main', () => '<script>')).toBe('unknown');
        expect(resolveBuild('38BDBCB', () => 'abc')).toBe('unknown');
    });
});

describe('resolveBuiltAt', () => {
    const now = () => new Date('2026-11-07T07:00:00Z');

    it('takes a valid given time, else now', () => {
        expect(resolveBuiltAt('2026-11-07T06:40:00Z', now)).toBe('2026-11-07T06:40:00.000Z');
        expect(resolveBuiltAt(undefined, now)).toBe('2026-11-07T07:00:00.000Z');
        expect(resolveBuiltAt('yesterday', now)).toBe('2026-11-07T07:00:00.000Z');
    });
});

describe('releaseName and versionLabel', () => {
    it('name the version and the commit', () => {
        expect(releaseName('5.0.0', '38bdbcb')).toBe('custoro@5.0.0+38bdbcb');
        expect(versionLabel('5.0.0', '38bdbcb')).toBe('v 5.0.0 · 38bdbcb');
    });

    it('show only the version for a build of unknown origin', () => {
        expect(versionLabel('5.0.0', 'unknown')).toBe('v 5.0.0');
    });
});
