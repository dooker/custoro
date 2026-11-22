import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';

export const supportedLngs = ['en', 'et', 'fun'];

// The chosen language, also sent with PDF requests (PdfButton)
export const languageStorage = 'language';

const savedLanguage = (): string | undefined => {
    try {
        const language = localStorage.getItem(languageStorage);
        return language && supportedLngs.includes(language) ? language : undefined;
    } catch {
        return undefined;
    }
};

// The saved language is the starting language and every change is saved the moment it happens.
// Restoring it later from a component effect raced the switcher: the first click was undone.
i18n.on('languageChanged', (language) => {
    try {
        localStorage.setItem(languageStorage, language);
    } catch {
        // Private windows can refuse storage; the language still changes for this visit
    }
});

i18n.use(Backend)
    .use(initReactI18next)
    .init({
        lng: savedLanguage(),
        fallbackLng: 'en',
        supportedLngs: supportedLngs,
        backend: {
            loadPath: '/locales/{{lng}}.json',
        },
    })
    .then();

export default i18n;
