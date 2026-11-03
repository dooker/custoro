import { act, fireEvent, waitFor } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import et from '../../../public/locales/et.json';
import { Axios } from '../../Axios';
import { renderScreen } from '../../test/renderScreen';
import { endpoint, PATHS } from '../../variables';
import { ProductForm } from './ProductForm';

vi.mock('../../Axios', () => ({ Axios: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

i18n.addResourceBundle('et', 'translation', et);

const renderNewProduct = async () => {
    const view = renderScreen(<ProductForm initialProduct={null} isNew type="product" />, {
        path: `${PATHS.PRODUCT}1/0/`,
        route: `${PATHS.PRODUCT}:page/:id/`,
    });

    // The fields load lazily
    await waitFor(() => expect(view.container.querySelector('input[name="code"]')).not.toBeNull());

    return view;
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Axios.post).mockResolvedValue({
        data: { success: true, insertId: 7 },
    } as AxiosResponse);
});

afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
});

describe('ProductForm unit of a new product', () => {
    // The unit is one of the API's values (pc, set, hour, m, km), whatever the unit is called
    // in the language of the page: "tk" is what Estonian calls a piece, and the API refuses it
    it.each([
        ['English', 'en'],
        ['Estonian', 'et'],
    ])('sends the API value for the default unit in %s', async (_name, language) => {
        await act(() => i18n.changeLanguage(language));
        const { container } = await renderNewProduct();

        fireEvent.submit(container.querySelector('form') as HTMLFormElement);

        await waitFor(() => expect(Axios.post).toHaveBeenCalledTimes(1));
        expect(Axios.post).toHaveBeenCalledWith(
            `${endpoint}${PATHS.PRODUCT}`,
            expect.objectContaining({ unit: 'pc' })
        );
    });
});
