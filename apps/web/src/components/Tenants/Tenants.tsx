import ListPage from '../_shared/List/ListPage';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { TenantIF } from '../../types/tenant';
import { PATHS, RESOURCE } from '../../variables';
import styles from './Tenants.module.sass';

// The owner page (docs/multi-tenant.md), a list like the others: every company with its number of
// people and invoices, never its customers or invoices. A row opens the company (Tenant.tsx).
const Tenants = () => {
    const { t } = useSafeTranslation();

    return (
        <ListPage<TenantIF>
            resource={RESOURCE.TENANTS}
            path={PATHS.TENANTS}
            title="tenants.plural"
            columns={[
                { key: 'id', label: '#', className: 'id' },
                { key: 'name', label: 'tenants.name', className: 'name' },
                { key: 'people', label: 'tenants.people', className: 'items wide-only' },
                { key: 'invoices', label: 'tenants.invoices', className: 'items wide-only' },
                {
                    key: 'created',
                    label: 'tenants.created',
                    className: `${styles.date} wide-only`,
                    render: ({ created }) => String(created).slice(0, 10),
                },
                {
                    key: 'active',
                    label: 'tenants.state',
                    // Right, with its heading, like the other short columns
                    className: 'items',
                    render: ({ active }) => (
                        <span className={`${styles.state} ${active ? styles.on : styles.off}`}>
                            {active ? t('tenants.active') : t('tenants.inactive')}
                        </span>
                    ),
                },
            ]}
            rowHref={({ id }, page) => `${PATHS.TENANT}${page}/${id}/`}
            rowClassName={({ active }) => (active ? '' : styles.inactive)}
            addHref={(page) => `${PATHS.TENANT}${page}/0/`}
            addTestId="add-tenant"
            tableClassName="tenants-table"
        />
    );
};

export default Tenants;
