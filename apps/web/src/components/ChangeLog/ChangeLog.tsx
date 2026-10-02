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
        // Copied from the repository root by the build (see package.json scripts)
        fetch('/CHANGELOG.md')
            .then((res) => res.text())
            .then((text) => {
                // The page already has a title, so drop the file's own heading
                setContent(text.replace(/^# .*\n/, '').trim());
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
