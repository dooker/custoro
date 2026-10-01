import { type Ref, lazy, useImperativeHandle, useState } from 'react';
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

const Pdf = lazy(() => import('./Views/Pdf'));
const Invoice = lazy(() => import('./Views/Invoice'));
const Forgot = lazy(() => import('./Views/Forgot'));
const Server = lazy(() => import('./Views/Server'));

export const tabs = {
    general: 'general',
    pdf: 'pdf',
    invoice: 'invoice',
    forgot: 'forgot',
    server: 'server',
};
export type TabKey = keyof typeof tabs;

export interface SettingsViewIF {
    settings: SettingsIF;
    onChange: ({ name, value }: EntityOnChangeIF) => void;
}

import type { FormHandleIF } from '../../types/form';

interface SettingsFormIF {
    ref?: Ref<FormHandleIF>;
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
    const notification = useNotificationHandler();

    const invalidator = async () => {
        await queryClient.invalidateQueries({ queryKey: [type] });
    };

    const { mutate: doSave } = useMutation<AxiosResponse, Error, MutateIF<SettingsIF>>({
        mutationFn: ({ data }) => {
            return Axios.put(`${endpoint}${PATHS.SETTINGS}`, data, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
        },
        onSuccess: async (response, variables) => {
            const { success, message } = response.data;

            await notification({ success, message, invalidator, show: variables.show });
        },
        onError: (err: Error) => handleError(err.message),
    });

    const debouncedAutoSave = useDebounce<[SettingsIF]>((data) => {
        doSave({ data });
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
            doSave({ data: draft, show: true });
        },
    }));

    return (
        <section className="component customer">
            <Tabs
                doSave={() => doSave({ data: draft })}
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
        </section>
    );
};
