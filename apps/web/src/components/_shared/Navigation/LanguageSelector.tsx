import { useState } from 'react';
import { supportedLngs } from '../../../i18n';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import styles from './LanguageSelector.module.sass';

export const languageStorage = 'language';

const LanguageSelector = () => {
    const { t, i18n } = useSafeTranslation();
    const localLanguage = localStorage.getItem(languageStorage) || supportedLngs[0];
    const [currentLanguage, setCurrentLanguage] = useState(localLanguage);

    const changeLanguage = (language: string) => {
        i18n.changeLanguage(language).then(() => {
            setCurrentLanguage(language);
            localStorage.setItem(languageStorage, language);
        });
    };

    return (
        <ul className={`pb-24 mx-12 ${styles.languageSelector}`}>
            {supportedLngs.map((item, index) => {
                return (
                    <li
                        className={currentLanguage === item ? styles.active : ''}
                        key={index}
                        onClick={() => changeLanguage(item)}
                    >
                        {t(`languages.${item}`)}
                    </li>
                );
            })}
        </ul>
    );
};

export default LanguageSelector;
