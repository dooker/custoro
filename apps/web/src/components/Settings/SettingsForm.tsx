import { lazy, useImperativeHandle, useRef, useState } from 'react';
import { debounceTimer, endpoint, PATHS } from '../../variables';
import { Axios } from '../../Axios';
import { handleError } from '../../shared/helpers';
import type { EntityOnChangeIF, MutateIF, SettingsIF } from '../../types';
import '@css/shared/Form.sass';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { Tabs } from './Tabs';
import General from './Views/General';
import type { AxiosResponse } from 'axios';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import type { FormRefIF } from '../../types/form';
import { changedSettings } from './settingsChanges';

const Pdf = lazy(() => import('./Views/Pdf'));
const Invoice = lazy(() => import('./Views/Invoice'));
const Forgot = lazy(() => import('./Views/Forgot'));
const Server = lazy(() => import('./Views/Server'));
const Export = lazy(() => import('./Views/Export'));

export const tabs = {
    general: 'general',
    pdf: 'pdf',
    invoice: 'invoice',
    forgot: 'forgot',
    server: 'server',
    export: 'export',
};
export type TabKey = keyof typeof tabs;

export interface SettingsViewIF {
    settings: SettingsIF;
    onChange: ({ name, value }: EntityOnChangeIF) => void;
}

interface SettingsFormIF extends FormRefIF {
    initialData: SettingsIF;
    type: string;
    activeTab: TabKey | null;
    setActiveTab: (tab: TabKey) => void;
}

export const SettingsForm = ({
    initialData,
    type,
    activeTab,
    setActiveTab,
    ref,
}: SettingsFormIF) => {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<SettingsIF>(initialData);
    // What the API has: the page's data, then every change it accepted. A save sends the difference
    const savedRef = useRef<SettingsIF>(initialData);
    const notification = useNotificationHandler();

    const invalidator = async () => {
        await queryClient.invalidateQueries({ queryKey: [type] });
    };

    const { mutate: doSave } = useMutation<AxiosResponse, Error, MutateIF<Partial<SettingsIF>>>({
        mutationFn: ({ data }) => {
            return Axios.put(`${endpoint}${PATHS.SETTINGS}`, data, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
        },
        onSuccess: async (response, variables) => {
            const { success, message } = response.data;

            if (success) {
                savedRef.current = { ...savedRef.current, ...variables.data };
            }

            // An autosave is silent, unless the API refused it: the change is not saved then
            await notification({ success, message, invalidator, show: variables.show || !success });
        },
        onError: async (err: Error) => {
            handleError(err.message);

            await notification({ success: false, show: true });
        },
    });

    const save = async (data: SettingsIF, show?: boolean) => {
        const changes = changedSettings(savedRef.current, data);

        if (Object.keys(changes).length) {
            doSave({ data: changes, show });
        } else if (show) {
            await notification({ success: true, show });
        }
    };

    const debouncedAutoSave = useDebounce<[SettingsIF]>((data) => {
        void save(data);
    }, debounceTimer);

    const onChange = ({ name, value }: EntityOnChangeIF) => {
        const updated: SettingsIF = {
            ...draft,
            [name]: value,
        };

        setDraft(updated);
        debouncedAutoSave(updated);
    };

    useImperativeHandle(ref, () => ({
        submitSave() {
            void save(draft, true);
        },
    }));

    return (
        <section className="component customer">
            <Tabs
                doSave={() => void save(draft)}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />

            <form className="general-form settings">
                {activeTab === tabs.general && <General settings={draft} onChange={onChange} />}
                {activeTab === tabs.pdf && <Pdf settings={draft} onChange={onChange} />}
                {activeTab === tabs.invoice && <Invoice settings={draft} onChange={onChange} />}
                {activeTab === tabs.forgot && <Forgot settings={draft} onChange={onChange} />}
                {activeTab === tabs.server && <Server settings={draft} onChange={onChange} />}
            </form>

            {activeTab === tabs.export && <Export />}
        </section>
    );
};
