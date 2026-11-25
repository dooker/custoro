import { describe, expect, it } from 'vitest';
import { RESOURCE } from '../../../variables';
import { menuItems } from './Navigation';

describe('menuItems', () => {
    it('keeps Settings last, with Companies right above it', () => {
        expect(menuItems.map(({ selector }) => selector).slice(-2)).toEqual([
            RESOURCE.TENANTS,
            RESOURCE.SETTINGS,
        ]);
    });
});
