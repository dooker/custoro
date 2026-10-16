import Button from '../_shared/Form/Button';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { PATHS } from '../../variables';
import { useNavigate } from 'react-router';
import styles from './Tabs.module.sass';

export const tabs = {
    general: 'general',
    pdf: 'pdf',
    invoice: 'invoice',
    forgot: 'forgot',
    server: 'server',
} as const;
type TabKey = keyof typeof tabs;

interface TabsIF {
    doSave: () => void;
    activeTab: TabKey | null;
    setActiveTab: (tab: TabKey) => void;
}

export const Tabs = ({ doSave, activeTab, setActiveTab }: TabsIF) => {
    const navigate = useNavigate();
    const { t } = useSafeTranslation();

    const onClick = (tab: TabKey) => {
        doSave();
        setActiveTab(tab);

        navigate(`${PATHS.SETTINGS}${tab}/`);
    };

    return (
        <div className={styles.tabButtons}>
            {Object.values(tabs).map((tab) => (
                <Button
                    key={tab}
                    additionalClassName={activeTab === tab ? 'disabled' : 'secondary'}
                    text={t(`settings.titles.${tab}Settings`)}
                    onClick={() => onClick(tab)}
                ></Button>
            ))}
        </div>
    );
};
