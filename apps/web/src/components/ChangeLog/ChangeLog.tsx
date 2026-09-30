import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Header from '../_shared/Header/Header';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import styles from './ChangeLog.module.sass';

const ChangeLog = () => {
    const [content, setContent] = useState('');
    const { t } = useSafeTranslation();
    const updateTitle = useHeadlineHandler();

    useEffect(() => {
        updateTitle({ title: t('changelog') });
    }, [t, updateTitle]);

    useEffect(() => {
        fetch('/README.md')
            .then((res) => res.text())
            .then((text) => {
                const match = text.match(/## Log\s*([\s\S]*)/);

                setContent(match ? match[1].trim() : '');
            });
    }, []);

    return (
        <>
            <Header />

            <section className={`component ${styles.changelog}`}>
                <div className="p-3">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
            </section>
        </>
    );
};

export default ChangeLog;
