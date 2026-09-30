import React, { ComponentType, lazy, LazyExoticComponent, Suspense, useEffect } from 'react';
import { storageChange, themeString } from '../variables';
import Loader from '../components/_shared/Loader/Loader';

const Flat = lazy(() => import('../themes/Flat/Flat'));
const Colors = lazy(() => import('../themes/Colors/Colors'));

const Themes: Record<string, LazyExoticComponent<ComponentType<object>>> = {
    flat: Flat,
    color: Colors,
};

const ThemeContext = () => {
    const defaultTheme = 'flat';
    const theme = localStorage.getItem(themeString) || defaultTheme;
    const Content = Themes[theme as keyof typeof Themes] || Flat;

    useEffect(() => {
        const handleStorageChange = () => {
            window.location.reload();
        };

        window.addEventListener(storageChange, handleStorageChange);

        // Clean up the listener when the component unmounts
        return () => window.removeEventListener(storageChange, handleStorageChange);
    }, []);

    return (
        <Suspense fallback={<Loader />}>
            <Content />
        </Suspense>
    );
};

export default ThemeContext;
