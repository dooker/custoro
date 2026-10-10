import { describe, expect, it } from 'vitest';
// One list of cases for the API and the web app, so the PDF and the screen always agree
import shared from '../../../api/helpers/foreignVatNumber.cases.json';
import { isForeignVatNumber } from './foreignVatNumber';

describe('isForeignVatNumber', () => {
    it.each(shared.cases)('$value is foreign: $foreign ($note)', ({ value, foreign }) => {
        expect(isForeignVatNumber(value)).toBe(foreign);
    });
});
