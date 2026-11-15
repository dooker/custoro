import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Axios } from '../../Axios';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import Header from '../_shared/Header/Header';
import Loader from '../_shared/Loader/Loader';
import Button from '../_shared/Form/Button';
import '@css/shared/Form.sass';
import styles from './Tenants.module.sass';

export interface TenantIF {
    id: number;
    name: string;
    active: number;
    created: string;
    people: number;
    invoices: number;
}

interface ApiAnswer {
    success: boolean;
    message?: string;
    data?: TenantIF[];
}

const url = `${endpoint}${PATHS.TENANTS}`;

// The owner page (docs/multi-tenant.md): every company with its number of people and invoices, a
// new company with its first admin, and renaming or switching a company off and on. It never
// shows a company's customers or invoices, only counts.
const Tenants = () => {
    const { t } = useSafeTranslation();
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();
    const notification = useNotificationHandler();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
    const [draft, setDraft] = useState({ name: '', adminEmail: '', adminName: '' });
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        updateTitle({ title: t('tenants.plural') });
        updateButtons({ buttons: [] });
    }, [t, updateTitle, updateButtons]);

    const { data, isLoading } = useQuery<ApiAnswer>({
        queryKey: [RESOURCE.TENANTS],
        queryFn: async () => (await Axios.get<ApiAnswer>(url)).data,
    });

    // Every change answers like the rest of the API; the list is read again after a success
    const send = async (change: () => Promise<{ data: ApiAnswer }>, savedMessage = 'saved') => {
        setBusy(true);

        try {
            const { success, message } = (await change()).data;

            await notification({
                success,
                message: success ? (message ?? savedMessage) : message,
                show: true,
                invalidator: () => queryClient.invalidateQueries({ queryKey: [RESOURCE.TENANTS] }),
            });

            return success;
        } catch {
            await notification({ success: false, message: 'error', show: true });

            return false;
        } finally {
            setBusy(false);
        }
    };

    const create = async (event?: FormEvent) => {
        event?.preventDefault();

        if (await send(() => Axios.post(url, draft))) {
            setDraft({ name: '', adminEmail: '', adminName: '' });
        }
    };

    const rename = async () => {
        if (
            editing &&
            (await send(() => Axios.put(`${url}${editing.id}`, { name: editing.name })))
        ) {
            setEditing(null);
        }
    };

    const setActive = (tenant: TenantIF, active: boolean) =>
        send(() => Axios.put(`${url}${tenant.id}`, { active }));

    const tenants = data?.data ?? [];

    return (
        <>
            <Header />

            <section className={`component ${styles.tenants}`}>
                <div className="p-3">
                    <p className={styles.intro}>{t('tenants.intro')}</p>

                    {isLoading ? (
                        <Loader />
                    ) : (
                        <table className={styles.table} data-testid="tenants-table">
                            <thead>
                                <tr>
                                    <th>{t('tenants.name')}</th>
                                    <th>{t('tenants.people')}</th>
                                    <th>{t('tenants.invoices')}</th>
                                    <th>{t('tenants.created')}</th>
                                    <th>{t('tenants.state')}</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.map((tenant) => (
                                    <tr
                                        key={tenant.id}
                                        className={tenant.active ? '' : styles.inactive}
                                        data-testid={`tenant-${tenant.id}`}
                                    >
                                        <td>
                                            {editing?.id === tenant.id ? (
                                                <input
                                                    aria-label={t('tenants.name')}
                                                    value={editing.name}
                                                    maxLength={150}
                                                    onChange={(event) =>
                                                        setEditing({
                                                            id: tenant.id,
                                                            name: event.target.value,
                                                        })
                                                    }
                                                />
                                            ) : (
                                                tenant.name
                                            )}
                                        </td>
                                        <td>{tenant.people}</td>
                                        <td>{tenant.invoices}</td>
                                        <td>{String(tenant.created).slice(0, 10)}</td>
                                        <td>
                                            {tenant.active
                                                ? t('tenants.active')
                                                : t('tenants.inactive')}
                                        </td>
                                        <td className={styles.buttons}>
                                            <div className={styles.actions}>
                                                {editing?.id === tenant.id ? (
                                                    <>
                                                        <Button
                                                            text={t('button.save')}
                                                            additionalClassName="small primary"
                                                            disabled={busy}
                                                            onClick={() => void rename()}
                                                        />
                                                        <Button
                                                            text={t('button.cancel')}
                                                            additionalClassName="small secondary"
                                                            onClick={() => setEditing(null)}
                                                        />
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            text={t('tenants.rename')}
                                                            additionalClassName="small secondary"
                                                            onClick={() =>
                                                                setEditing({
                                                                    id: tenant.id,
                                                                    name: tenant.name,
                                                                })
                                                            }
                                                        />
                                                        <Button
                                                            text={
                                                                tenant.active
                                                                    ? t('tenants.deactivate')
                                                                    : t('tenants.activate')
                                                            }
                                                            additionalClassName="small secondary"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                void setActive(
                                                                    tenant,
                                                                    !tenant.active
                                                                )
                                                            }
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    <form
                        className={`general-form ${styles.create}`}
                        onSubmit={(event) => void create(event)}
                    >
                        <h3>{t('tenants.new')}</h3>
                        <p>{t('tenants.newHelp')}</p>
                        <label className="field">
                            <span>{t('tenants.name')}</span>
                            <input
                                name="name"
                                required
                                maxLength={150}
                                value={draft.name}
                                onChange={(event) =>
                                    setDraft({ ...draft, name: event.target.value })
                                }
                            />
                        </label>
                        <label className="field">
                            <span>{t('tenants.adminEmail')}</span>
                            <input
                                name="adminEmail"
                                type="email"
                                required
                                maxLength={254}
                                value={draft.adminEmail}
                                onChange={(event) =>
                                    setDraft({ ...draft, adminEmail: event.target.value })
                                }
                            />
                        </label>
                        <label className="field">
                            <span>{t('tenants.adminName')}</span>
                            <input
                                name="adminName"
                                maxLength={100}
                                value={draft.adminName}
                                onChange={(event) =>
                                    setDraft({ ...draft, adminName: event.target.value })
                                }
                            />
                        </label>
                        <Button
                            text={t('tenants.create')}
                            additionalClassName="primary"
                            disabled={busy}
                            dataTestId="create-tenant"
                            onClick={() => void create()}
                        />
                    </form>
                </div>
            </section>
        </>
    );
};

export default Tenants;
