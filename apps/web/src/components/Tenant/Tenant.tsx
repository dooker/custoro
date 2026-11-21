import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Axios } from '../../Axios';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import { getSingle } from '../../utils/Getters/getSingle';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';
import Header from '../_shared/Header/Header';
import Loader from '../_shared/Loader/Loader';
import Field from '../_shared/Form/Field';
import PageNotFound from '../PageNotFound/PageNotFound';
import type { EntityOnChangeIF } from '../../types';
import type { NewTenantIF, TenantIF } from '../../types/tenant';
import type { HeaderButtonIF } from '../../types/header';
import '@css/shared/Form.sass';
import styles from './Tenant.module.sass';
import { usePageParam } from '../../hooks/usePageParam';

interface ApiAnswer {
    success: boolean;
    message?: string;
    insertId?: number;
}

const url = `${endpoint}${PATHS.TENANTS}`;
const emptyDraft: NewTenantIF = { name: '', adminEmail: '', adminName: '' };

// One company on the owner page: a new one with its first admin (id 0), or an existing one to
// rename and to switch off and on. It shows counts, never the company's customers or invoices.
const Tenant = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { id: rawId } = useParams();
    const id = Number(rawId);
    const page = usePageParam();
    const isNew = id === 0;
    const notification = useNotificationHandler();
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<NewTenantIF>(emptyDraft);
    const [busy, setBusy] = useState(false);

    const { data: tenant, isLoading } = useQuery<TenantIF | null>({
        queryKey: [RESOURCE.TENANT, rawId],
        queryFn: () => getSingle<TenantIF>({ id, type: RESOURCE.TENANT }),
        enabled: !isNew,
    });

    // The form starts with the saved name once it is loaded
    const [loadedId, setLoadedId] = useState<number | null>(null);
    if (tenant && tenant.id !== loadedId) {
        setLoadedId(tenant.id);
        setDraft({ ...emptyDraft, name: tenant.name });
    }

    const title = isNew
        ? t('tenants.new')
        : `${t('tenants.singular')}${tenant ? ` - ${tenant.name}` : ''}`;

    const invalidator = async () => {
        await queryClient.invalidateQueries({ queryKey: [RESOURCE.TENANTS] });
        await queryClient.invalidateQueries({ queryKey: [RESOURCE.TENANT] });
    };

    // Every change answers like the rest of the API; the lists are read again after a success
    const send = async (change: () => Promise<{ data: ApiAnswer }>) => {
        setBusy(true);

        try {
            const answer = (await change()).data;

            await notification({
                success: answer.success,
                message: answer.message ?? (answer.success ? 'saved' : 'error'),
                show: true,
                invalidator,
            });

            return answer;
        } catch {
            await notification({ success: false, message: 'error', show: true });

            return null;
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (isNew) {
            const answer = await send(() => Axios.post(url, draft));

            if (answer?.success && answer.insertId) {
                navigate(`${PATHS.TENANT}${page}/${answer.insertId}/`);
            }

            return;
        }

        await send(() => Axios.put(`${url}${id}`, { name: draft.name }));
    };

    const buttons: HeaderButtonIF[] = [
        {
            label: isNew ? 'tenants.create' : 'button.save',
            onClick: () => void save(),
            dataTestId: 'save-tenant',
            classname: `primary${busy ? ' disabled' : ''}`,
        },
        ...(tenant
            ? [
                  {
                      label: tenant.active ? 'tenants.deactivate' : 'tenants.activate',
                      onClick: () =>
                          void send(() => Axios.put(`${url}${id}`, { active: !tenant.active })),
                      // Switching off locks the company's people out: red, like other actions
                      // that take something away
                      classname: `${tenant.active ? 'tertiary' : 'primary'}${busy ? ' disabled' : ''}`,
                      dataTestId: 'switch-tenant',
                  },
              ]
            : []),
        {
            label: 'button.goBack',
            onClick: () => navigate(`${PATHS.TENANTS}${page}/`),
            classname: 'secondary',
        },
    ];

    const onChange = ({ name, value }: EntityOnChangeIF) =>
        setDraft((previous) => ({ ...previous, [name]: String(value ?? '') }));

    // Enter in a field saves, like the header's Save button
    const onSubmit = (event: FormEvent) => {
        event.preventDefault();

        if (!busy) {
            void save();
        }
    };

    if (!isNew && isLoading) return <Loader />;
    if (!isNew && !tenant) return <PageNotFound />;

    const fields = isNew
        ? [{ name: 'name' }, { name: 'adminEmail', type: 'email' }, { name: 'adminName' }]
        : [{ name: 'name' }];

    return (
        <>
            <Header title={title} buttons={buttons} />

            <section className="component tenant">
                <p className={styles.intro}>{isNew ? t('tenants.newHelp') : t('tenants.intro')}</p>

                <form
                    key={`${rawId}-${loadedId}`}
                    className={`general-form ${styles.form}`}
                    onSubmit={onSubmit}
                    aria-busy={busy}
                >
                    {fields.map((field) => (
                        <Field
                            key={field.name}
                            parent={RESOURCE.TENANTS}
                            {...field}
                            value={draft[field.name as keyof NewTenantIF]}
                            onChange={onChange}
                        />
                    ))}

                    <input type="submit" className="hidden" />
                </form>

                {tenant && (
                    <dl className={styles.facts} data-testid="tenant-facts">
                        <div>
                            <dt>{t('tenants.state')}</dt>
                            <dd>
                                <span
                                    className={`${styles.state} ${tenant.active ? styles.on : styles.off}`}
                                >
                                    {tenant.active ? t('tenants.active') : t('tenants.inactive')}
                                </span>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('tenants.people')}</dt>
                            <dd>{tenant.people}</dd>
                        </div>
                        <div>
                            <dt>{t('tenants.invoices')}</dt>
                            <dd>{tenant.invoices}</dd>
                        </div>
                        <div>
                            <dt>{t('tenants.created')}</dt>
                            <dd>{String(tenant.created).slice(0, 10)}</dd>
                        </div>
                    </dl>
                )}
            </section>
        </>
    );
};

export default Tenant;
