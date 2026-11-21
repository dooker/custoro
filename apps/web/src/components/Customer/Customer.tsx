import { useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import { CustomerForm } from './CustomerForm';
import { useNavigate, useParams } from 'react-router';
import { getSingle } from '../../utils/Getters/getSingle';
import Loader from '../_shared/Loader/Loader';
import PageNotFound from '../PageNotFound/PageNotFound';
import { useQuery } from '@tanstack/react-query';
import '@css/shared/Form.sass';
import { PATHS, RESOURCE } from '../../variables';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Header from '../_shared/Header/Header';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import type { CustomerIF } from '../../types/customer';
import { usePageParam } from '../../hooks/usePageParam';

const Customer = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { id: customerId } = useParams();
    const page = usePageParam();
    const isNew = customerId === '0';
    const formRef = useRef<FormHandleIF>(null);
    const { promptDelete } = useDeleteItem([RESOURCE.CUSTOMERS]);

    // fetch customer
    const { data: customer, isLoading } = useQuery<CustomerIF | null>({
        queryKey: [RESOURCE.CUSTOMER, customerId],
        queryFn: () => getSingle<CustomerIF>({ id: Number(customerId), type: RESOURCE.CUSTOMER }),
    });

    const title = isNew
        ? `${t('new')} ${t('customers.singular')}`
        : `${t('customers.singular')}${customer ? ` - ${customer.name}` : ''}`;
    const buttons = [
        {
            label: 'button.save',
            onClick: () => formRef.current?.submitSave(),
        },
        {
            label: 'button.goBack',
            onClick: () => navigate(`${PATHS.CUSTOMERS}${page}/`),
            classname: 'secondary',
        },
        ...(customer
            ? [
                  {
                      label: 'worksheets.plural',
                      onClick: () => navigate(`${PATHS.WORKSHEETS}1/${customer.id}/1/`),
                      classname: 'secondary',
                  },
                  {
                      label: 'button.delete',
                      onClick: () =>
                          promptDelete({ id: customer.id, resource: RESOURCE.CUSTOMERS, page }),
                      classname: 'tertiary',
                  },
              ]
            : []),
    ];

    if (isLoading) return <Loader />;
    if (!isNew && !customer) return <PageNotFound />;

    return (
        <>
            <Header title={title} buttons={buttons} />

            <CustomerForm
                ref={formRef}
                initialCustomer={customer ?? null}
                isNew={isNew}
                type={RESOURCE.CUSTOMER}
            />
        </>
    );
};

export default Customer;
