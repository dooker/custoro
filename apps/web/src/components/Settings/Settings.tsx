import { useEffect, useRef, useState } from 'react';
import Loader from '../_shared/Loader/Loader';
import { getGeneral } from '../../utils/Getters/getGeneral';
import '@css/shared/Form.sass';
import { useQuery } from '@tanstack/react-query';
import { SettingsForm } from './SettingsForm';
import { RESOURCE } from '../../variables';
import Header from '../_shared/Header/Header';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useParams } from 'react-router-dom';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';

const tabs = {
    general: 'general',
    pdf: 'pdf',
    invoice: 'invoice',
    forgot: 'forgot',
    server: 'server',
};
type TabKey = keyof typeof tabs;

const Settings = () => {
    const { t } = useSafeTranslation();
    const params = useParams();
    const tabType = params.type as TabKey;
    const [activeTab, setActiveTab] = useState<TabKey>(
        tabType || (Object.values(tabs)[0] as TabKey)
    );
    const formRef = useRef<{ submitSave: () => void }>(null);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    // fetch settings
    const { data: settings, isLoading } = useQuery({
        queryKey: [RESOURCE.SETTINGS],
        queryFn: () => getGeneral({ type: RESOURCE.SETTINGS }),
    });

    // Set up header config
    useEffect(() => {
        updateTitle({ title: t(`settings.titles.${activeTab}Settings`) });
    }, [t, updateTitle, activeTab]);
    useEffect(() => {
        const saveButton = {
            label: 'button.save',
            onClick: () => formRef.current && formRef.current.submitSave(),
        };

        updateButtons({ buttons: [saveButton] });
    }, [updateButtons, activeTab]);

    if (isLoading) return <Loader />;

    return (
        <>
            <Header />

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

export default Settings;
