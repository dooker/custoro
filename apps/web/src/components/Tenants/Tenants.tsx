import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Axios } from '../../Axios';
import { endpoint, PATHS, RESOURCE } from '../../variables';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';
import { useKeyword } from '../../hooks/useKeyword';
import { handleError, visibleRowCount } from '../../shared/helpers';
import DefaultList from '../_shared/DefaultList';
import NoEntries from '../_shared/NoEntries/NoEntries';
import Loader from '../_shared/Loader/Loader';
import type { DataResponseIF } from '../../types';
import type { HeaderIF } from '../../types/header';
import type { TenantIF } from '../../types/tenant';
import styles from './Tenants.module.sass';

// A page of the companies; the API pages and searches them itself (GET /tenants is owner only,
// so the shared search endpoint does not list them)
const getTenants = (page: number, limit: number, keyword: string) =>
    Axios.get<DataResponseIF<TenantIF>>(`${endpoint}${PATHS.TENANTS}`, {
        params: { page, limit, ...(keyword ? { keyword } : {}) },
    })
        .then(({ data }) => data)
        .catch((error) => {
            handleError(error);

            return { resource: [] } as DataResponseIF<TenantIF>;
        });

// The owner page (docs/multi-tenant.md), a list like the others: every company with its number of
// people and invoices, never its customers or invoices. A row opens the company (Tenant.tsx).
const Tenants = () => {
    const page = Number(useParams().page) || 1;
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const { keyword, updateKeyword } = useKeyword();
    const limit = visibleRowCount();
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    useEffect(() => {
        updateTitle({ title: t('tenants.plural') });
    }, [t, updateTitle]);

    useEffect(() => {
        updateButtons({
            buttons: [
                { label: 'button.search' },
                {
                    label: 'button.add',
                    onClick: () => navigate(`${PATHS.TENANT}${page}/0/`),
                    dataTestId: 'add-tenant',
                },
            ],
        });
    }, [updateButtons, navigate, page]);

    const header: HeaderIF = { keyword: '', updateKeyword };

    const { data, isLoading } = useQuery<DataResponseIF<TenantIF>>({
        queryKey: [RESOURCE.TENANTS, limit, page, keyword],
        queryFn: () => getTenants(page, limit, keyword),
        placeholderData: keepPreviousData,
    });
    const { resource: tenants, meta } = data || {};

    const showList = () => {
        if (!tenants?.length) {
            return <NoEntries />;
        }

        const open = (id: number) => navigate(`${PATHS.TENANT}${page}/${id}/`);

        return (
            <table className="general-table tenants-table" data-testid="tenants-table">
                <thead>
                    <tr>
                        <th className="id">#</th>
                        <th className="name">{t('tenants.name')}</th>
                        <th className="items">{t('tenants.people')}</th>
                        <th className="items">{t('tenants.invoices')}</th>
                        <th>{t('tenants.created')}</th>
                        <th>{t('tenants.state')}</th>
                    </tr>
                </thead>
                <tbody>
                    {tenants.map((tenant) => (
                        <tr
                            key={tenant.id}
                            className={`row${tenant.active ? '' : ` ${styles.inactive}`}`}
                            data-testid={`tenant-${tenant.id}`}
                            onClick={() => open(tenant.id)}
                        >
                            <td className="id">{tenant.id}</td>
                            <td className="name">{tenant.name}</td>
                            <td className="items">{tenant.people}</td>
                            <td className="items">{tenant.invoices}</td>
                            <td className={styles.date}>{String(tenant.created).slice(0, 10)}</td>
                            <td>
                                <span
                                    className={`${styles.state} ${tenant.active ? styles.on : styles.off}`}
                                >
                                    {tenant.active ? t('tenants.active') : t('tenants.inactive')}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    if (isLoading) {
        return <Loader />;
    }

    return (
        <DefaultList
            list={RESOURCE.TENANTS}
            loader={isLoading}
            renderer={showList}
            meta={meta}
            path={PATHS.TENANTS}
            header={header}
        />
    );
};

export default Tenants;
