import { describe, expect, it } from 'vitest';
import { changedSettings } from './settingsChanges';

const saved = {
    vat: '24',
    lastInvoiceId: '25003',
    companyName: 'Quantum Desk Co.',
    logo: 'logo.png',
    invoiceHtml: '<p>Hello</p>',
};

describe('changedSettings', () => {
    it('is empty for a form nobody changed', () => {
        expect(changedSettings(saved, { ...saved })).toEqual({});
    });

    it('returns only the settings that differ', () => {
        expect(changedSettings(saved, { ...saved, vat: '23', companyName: '' })).toEqual({
            vat: '23',
            companyName: '',
        });
    });

    it('leaves the invoice counter out unless it was edited', () => {
        expect(changedSettings(saved, { ...saved, vat: '23' })).not.toHaveProperty('lastInvoiceId');
        expect(changedSettings(saved, { ...saved, lastInvoiceId: '30000' })).toEqual({
            lastInvoiceId: '30000',
        });
    });

    it('never sends the name of the stored logo, or null after it was deleted', () => {
        expect(changedSettings(saved, { ...saved, logo: 'other.png' })).toEqual({});
        expect(changedSettings(saved, { ...saved, logo: null as unknown as string })).toEqual({});
    });

    it('sends a newly picked logo file, once', () => {
        const file = new File(['png'], 'logo.png', { type: 'image/png' });

        expect(changedSettings(saved, { ...saved, logo: file as unknown as string })).toEqual({
            logo: file,
        });
        // After the API took it the file is what it has
        const afterUpload = { ...saved, logo: file as unknown as string };

        expect(changedSettings(afterUpload, { ...afterUpload })).toEqual({});
    });
});
