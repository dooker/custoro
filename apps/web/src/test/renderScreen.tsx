import { Suspense, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import en from '../../public/locales/en.json';

// The real English texts, so a test reads what the user reads and a renamed key fails it
await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } } });

// Stands in for every page the screen can navigate to
const Elsewhere = () => <p data-testid="path">{useLocation().pathname}</p>;

interface RenderScreenOptions {
    // The URL the screen is opened at
    path: string;
    // The route pattern the screen is mounted on, when it has params such as /restore/:token/
    route?: string;
}

// Renders a screen in the providers it has in the app: router, query client and Suspense for the
// lazy form fields (wait for them with findBy...). Navigating away shows the new path in an
// element with the test id "path".
export const renderScreen = (screen: ReactElement, { path, route = path }: RenderScreenOptions) =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter initialEntries={[path]}>
                <Suspense fallback={null}>
                    <Routes>
                        <Route path={route} element={screen} />
                        <Route path="*" element={<Elsewhere />} />
                    </Routes>
                </Suspense>
            </MemoryRouter>
        </QueryClientProvider>
    );
