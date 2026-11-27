import { useEffect, useRef, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import Button from '../_shared/Form/Button';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { PATHS, wideScreen } from '../../variables';
import { useNavigate } from 'react-router';
import styles from './Tabs.module.sass';

export const tabs = {
    general: 'general',
    pdf: 'pdf',
    invoice: 'invoice',
    forgot: 'forgot',
    server: 'server',
    export: 'export',
} as const;
type TabKey = keyof typeof tabs;

interface TabsIF {
    doSave: () => void;
    activeTab: TabKey | null;
    setActiveTab: (tab: TabKey) => void;
}

/**
 * The settings' sections. Mobile first: below tablet landscape one button shows the section open
 * and opens the list of them (six tabs in rows looked cramped on a phone); from there a tab each.
 */
export const Tabs = ({ doSave, activeTab, setActiveTab }: TabsIF) => {
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const wide = useMediaQuery(wideScreen, { noSsr: true });
    const [open, setOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);
    const label = (tab: TabKey) => t(`settings.titles.${tab}Settings`);

    // The open list floats over the form: a tap outside it or Escape closes it
    useEffect(() => {
        if (!open) {
            return;
        }

        const onPointer = (event: PointerEvent) => {
            if (!pickerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const onClick = (tab: TabKey) => {
        setOpen(false);
        doSave();
        setActiveTab(tab);

        navigate(`${PATHS.SETTINGS}${tab}/`);
    };

    if (!wide) {
        return (
            <div className={styles.picker} ref={pickerRef}>
                <button
                    type="button"
                    className={styles.current}
                    aria-expanded={open}
                    aria-controls="settings-sections"
                    data-testid="settings-sections"
                    onClick={() => setOpen(!open)}
                >
                    {label(activeTab ?? tabs.general)}
                    <span className={styles.chevron} aria-hidden="true" />
                </button>

                {open && (
                    <ul id="settings-sections" className={styles.sections}>
                        {Object.values(tabs).map((tab) => (
                            <li key={tab}>
                                <button
                                    type="button"
                                    aria-current={activeTab === tab ? 'page' : undefined}
                                    onClick={() => onClick(tab)}
                                >
                                    {label(tab)}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    return (
        <div className={styles.tabButtons}>
            {Object.values(tabs).map((tab) => (
                <Button
                    key={tab}
                    additionalClassName={activeTab === tab ? 'disabled' : 'secondary'}
                    text={label(tab)}
                    onClick={() => onClick(tab)}
                ></Button>
            ))}
        </div>
    );
};
