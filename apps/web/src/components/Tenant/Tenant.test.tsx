import { Suspense } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Axios } from '../../Axios';
// Sets up i18n with the English texts, as for the other screen tests
import '../../test/renderScreen';
import Tenant from './Tenant';

vi.mock('../../Axios', () => ({ Axios: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

const Back = () => {
    const navigate = useNavigate();

    return <button onClick={() => navigate(-1)}>back</button>;
};

// The browser's history: the new company form, then the company just made (id 5)
const renderAfterCreate = () =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter initialEntries={['/tenant/1/0/', '/tenant/1/5/']} initialIndex={1}>
                <Suspense fallback={null}>
                    <Routes>
                        <Route
                            path="/tenant/:page/:id/"
                            element={
                                <>
                                    <Tenant />
                                    <Back />
                                </>
                            }
                        />
                    </Routes>
                </Suspense>
            </MemoryRouter>
        </QueryClientProvider>
    );

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Axios.get).mockResolvedValue({
        data: {
            success: true,
            data: [
                {
                    id: 5,
                    name: 'Orbit OÜ',
                    active: 1,
                    created: '2026-11-22',
                    people: 1,
                    invoices: 0,
                },
            ],
        },
    } as AxiosResponse);
});

describe('Tenant', () => {
    it('shows the company it opens with its name', async () => {
        renderAfterCreate();

        expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Orbit OÜ');
    });

    // Copilot review of PR 46, round 2: Back from the company just made to the new company form
    // kept its name, so a second Create sent the same company again
    it('starts the new company form empty after Back from a company', async () => {
        renderAfterCreate();
        await screen.findByDisplayValue('Orbit OÜ');

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(await screen.findByRole('heading', { name: 'New company' })).toBeInTheDocument();
        expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('');
        expect(screen.getByRole('textbox', { name: 'Email of its first admin' })).toHaveValue('');
    });
});
