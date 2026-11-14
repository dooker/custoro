import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Header from '../_shared/Header/Header';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { boldLeads, sectionKind, splitChangeLog, type ChangeLogParts } from './releases';
import styles from './ChangeLog.module.sass';

const text = (children: ReactNode) => (Array.isArray(children) ? children.join('') : `${children}`);

// "### Added" and the like as a coloured label above its list
const markdownComponents: Components = {
    h3: ({ children }) => (
        <h3 className={`${styles.section} ${styles[sectionKind(text(children))]}`}>{children}</h3>
    ),
};

const ChangeLog = () => {
    const [changelog, setChangelog] = useState<ChangeLogParts>({ intro: '', releases: [] });
    const { t } = useSafeTranslation();
    const updateTitle = useHeadlineHandler();

    useEffect(() => {
        updateTitle({ title: t('changelog') });
    }, [t, updateTitle]);

    useEffect(() => {
        // Copied from the repository root by the build (see package.json scripts). Leaving the
        // page before it arrives cancels the request instead of setting state on a gone screen.
        const controller = new AbortController();
        fetch('/CHANGELOG.md', { signal: controller.signal })
            .then((res) => res.text())
            .then((markdown) => setChangelog(splitChangeLog(markdown)))
            .catch((error: unknown) => {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    throw error;
                }
            });
        return () => controller.abort();
    }, []);

    return (
        <>
            <Header />

            <section className={`component ${styles.changelog}`}>
                <div className="p-3">
                    {changelog.intro && (
                        <div className={styles.intro}>
                            <ReactMarkdown>{changelog.intro}</ReactMarkdown>
                        </div>
                    )}

                    {changelog.releases.map((release, index) => (
                        // The newest release is open, the older ones one click away
                        <details
                            key={release.version}
                            className={styles.release}
                            open={index === 0}
                        >
                            <summary className={styles.summary}>
                                <span className={styles.version}>{release.version}</span>
                                {release.date && (
                                    <time className={styles.date} dateTime={release.date}>
                                        {release.date}
                                    </time>
                                )}
                            </summary>
                            <div className={styles.body}>
                                <ReactMarkdown components={markdownComponents}>
                                    {boldLeads(release.body)}
                                </ReactMarkdown>
                            </div>
                        </details>
                    ))}
                </div>
            </section>
        </>
    );
};

export default ChangeLog;
