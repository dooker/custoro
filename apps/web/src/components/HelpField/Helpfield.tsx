import DOMPurify from 'dompurify';
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

    const cleanHtml = DOMPurify.sanitize(t(text));
    const classNames = [styles.help, position && styles[position], type && styles[type]].join(' ');

    return <div className={classNames} dangerouslySetInnerHTML={{ __html: cleanHtml }}></div>;
};

export default HelpField;
