import { useRef, useState } from 'react';
import type { FormHandleIF } from '../../types/form';
import Loader from '../_shared/Loader/Loader';
import { getGeneral } from '../../utils/Getters/getGeneral';
import '@css/shared/Form.sass';
import { useQuery } from '@tanstack/react-query';
import { SettingsForm } from './SettingsForm';
import { RESOURCE } from '../../variables';
import Header from '../_shared/Header/Header';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useParams } from 'react-router';

const tabs = {
    general: 'general',
    pdf: 'pdf',
    invoice: 'invoice',
    forgot: 'forgot',
    server: 'server',
    export: 'export',
};
type TabKey = keyof typeof tabs;

const SettingsPage = () => {
    const { t } = useSafeTranslation();
    const params = useParams();
    const tabType = params.type as TabKey;
    const [activeTab, setActiveTab] = useState<TabKey>(
        tabType || (Object.values(tabs)[0] as TabKey)
    );
    const formRef = useRef<FormHandleIF>(null);

    // fetch settings
    const { data: settings, isLoading } = useQuery({
        queryKey: [RESOURCE.SETTINGS],
        queryFn: () => getGeneral({ type: RESOURCE.SETTINGS }),
    });

    const buttons = [{ label: 'button.save', onClick: () => formRef.current?.submitSave() }];

    if (isLoading) return <Loader />;

    return (
        <>
            <Header title={t(`settings.titles.${activeTab}Settings`)} buttons={buttons} />

            <SettingsForm
                ref={formRef}
                initialData={settings}
                type={RESOURCE.SETTINGS}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />
        </>
    );
};

// Only mounted for admins (AdminRoute): the API lets nobody else change settings
export default SettingsPage;
