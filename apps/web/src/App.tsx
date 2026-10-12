import { useEffect } from 'react';
import '@css/application.sass';
import './tailwind.css';
import { BrowserRouter } from 'react-router';
// import ThemeContext from './contexts/Theme';
import { AuthProvider } from './contexts/Auth';
import AppContent from './AppContent';

import { useTranslation } from 'react-i18next';
import { languageStorage } from './components/_shared/Navigation/LanguageSelector';
import { lastUrl } from './variables';
import Logo from '@images/background.svg?react';

const App = () => {
    const { i18n } = useTranslation();

    useEffect(() => {
        const localLanguage = localStorage.getItem(languageStorage);

        if (localLanguage && i18n.language !== localLanguage) {
            i18n.changeLanguage(localLanguage).then();
        }
    }, [i18n]);

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
