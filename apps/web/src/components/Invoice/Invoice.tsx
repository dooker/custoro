import { useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import Loader from '../_shared/Loader/Loader';
import type { InvoiceIF } from '../../types';
import { useNavigate, useParams } from 'react-router';
import '@css/shared/Form.sass';
import { useQuery } from '@tanstack/react-query';
import { getSingle } from '../../utils/Getters/getSingle';
import PageNotFound from '../PageNotFound/PageNotFound';
import { InvoiceForm } from './InvoiceForm';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { PATHS, RESOURCE } from '../../variables';
import Header from '../_shared/Header/Header';
import styles from './Invoice.module.sass';
import { usePageParam } from '../../hooks/usePageParam';

const Invoice = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { invoiceId } = useParams();
    const page = usePageParam();
    const isNew = invoiceId === '0';
    const formRef = useRef<FormHandleIF>(null);

    const { data: invoice, isLoading } = useQuery<InvoiceIF | null>({
        queryKey: [RESOURCE.INVOICE, invoiceId],
        queryFn: () => getSingle<InvoiceIF>({ id: Number(invoiceId), type: RESOURCE.INVOICE }),
        enabled: !isNew,
    });
    const { locked } = invoice || {};

    const title = isNew
        ? `${t('new')} ${t('invoices.singular')}`
        : `${t('invoices.singular')}${invoice ? ` #${invoice.number}` : ''}`;
    const saveButton = {
        label: 'button.save',
        onClick: () => formRef.current?.submitSave(),
    };
    const goBackButton = {
        label: 'button.goBack',
        onClick: () => navigate(`${PATHS.INVOICES}${page}/`),
        classname: 'secondary',
    };
    // A paid invoice cannot be changed: no Save
    const buttons = [...(locked === 1 ? [] : [saveButton]), goBackButton];

    if (isLoading) return <Loader />;
    if (!isNew && !invoice) return <PageNotFound />;

    // Have key include items count - with handles draft state to be updated on new item adding
    const key = `${invoiceId}-${invoice?.items?.length}`;

    return (
        <>
            <Header title={title} buttons={buttons} />

            <section className={`component ${styles.invoice}`}>
                <InvoiceForm
                    ref={formRef}
                    key={key}
                    initialInvoice={invoice ?? null}
                    isNew={isNew}
                    type={RESOURCE.INVOICE}
                />
            </section>
        </>
    );
};

export default Invoice;
