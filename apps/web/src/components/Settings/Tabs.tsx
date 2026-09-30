import Button from '../_shared/Form/Button';
import { useAuth } from '../../contexts/Auth';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { PATHS } from '../../variables';
import { useNavigate } from 'react-router-dom';
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
    const { user } = useAuth();
    const { role } = user || {};
    const { t } = useSafeTranslation();
    const adminOnly: (typeof tabs)[keyof typeof tabs][] = [tabs.server];
    const isNotAllowed = (tab: TabKey) => adminOnly.includes(tab) && role !== 'admin';

    const onClick = (tab: TabKey) => {
        if (isNotAllowed(tab)) {
            return;
        }

        doSave();
        setActiveTab(tab);

        navigate(`${PATHS.SETTINGS}${tab}/`);
    };

    return (
        <div className={styles.tabButtons}>
            {Object.values(tabs).map((tab) => {
                if (tab === tabs.server && role === 'user') {
                    return '';
                }

                return (
                    <Button
                        key={tab}
                        additionalClassName={activeTab === tab ? 'disabled' : 'secondary'}
                        text={t(`settings.titles.${tab}Settings`)}
                        onClick={() => onClick(tab)}
                    ></Button>
                );
            })}
        </div>
    );
};
