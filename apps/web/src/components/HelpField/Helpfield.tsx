import SafeHtml from '../_shared/SafeHtml/SafeHtml';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import styles from './Helpfield.module.sass';

interface HelpFieldIF {
    text: string;
    position?: string;
    type?: string;
}

const HelpField = ({ text, position, type }: HelpFieldIF) => {
    const { t } = useSafeTranslation();

    if (!text) {
        return null;
    }

    const classNames = [styles.help, position && styles[position], type && styles[type]].join(' ');

    return <SafeHtml className={classNames} html={t(text)} />;
};

export default HelpField;
