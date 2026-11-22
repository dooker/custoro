import { useEffect } from 'react';
// Roboto comes with the app (Latin and Latin Extended, for Estonian), not from Google's servers
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-ext-400.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-ext-700.css';
import '@css/application.sass';
import './tailwind.css';
import { BrowserRouter } from 'react-router';
// import ThemeContext from './contexts/Theme';
import { AuthProvider } from './contexts/Auth';
import AppContent from './AppContent';

import { lastUrl } from './variables';
import Logo from '@images/background.svg?react';

// The saved language is restored by i18n itself (i18n.tsx)
const App = () => {
    useEffect(() => {
        const isPdf = location.pathname.startsWith('/pdf');

        if (!isPdf) {
            localStorage.setItem(lastUrl, location.pathname);
        }

        document.getElementById('root')?.classList.toggle('pdf', isPdf);
    }, []);

    return (
        <AuthProvider>
            <BrowserRouter>
                {/*<ThemeContext />*/}
                <Logo />
                <AppContent />
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
