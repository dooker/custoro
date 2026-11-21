import { supportedLngs } from '../../../i18n';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import styles from './LanguageSelector.module.sass';

const LanguageSelector = () => {
    const { t, i18n } = useSafeTranslation();
    // i18n saves the choice (i18n.tsx); the star follows the language the texts are shown in
    const currentLanguage = i18n.resolvedLanguage ?? i18n.language;

    return (
        <ul className={`pb-24 mx-12 ${styles.languageSelector}`}>
            {supportedLngs.map((item) => {
                return (
                    <li
                        className={currentLanguage === item ? styles.active : ''}
                        key={item}
                        onClick={() => i18n.changeLanguage(item).then()}
                    >
                        {t(`languages.${item}`)}
                    </li>
                );
            })}
        </ul>
    );
};

export default LanguageSelector;
