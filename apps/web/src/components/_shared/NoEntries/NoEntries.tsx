import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import styles from './NoEntries.module.sass';

const NoEntries = () => {
    const { t } = useSafeTranslation();

    return <div className={styles.noEntries}>{t('emptyList')}</div>;
};

export default NoEntries;
