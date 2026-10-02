import { useEffect, useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import { CustomerForm } from './CustomerForm';
import { useNavigate, useParams } from 'react-router-dom';
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
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';

const Customer = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { id: customerId, page: rawPage } = useParams();
    const page = Number(rawPage || 1);
    const isNew = customerId === '0';
    const formRef = useRef<FormHandleIF>(null);
    const { promptDelete } = useDeleteItem([RESOURCE.CUSTOMERS]);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    // fetch customer
    const { data: customer, isLoading } = useQuery<CustomerIF | null>({
        queryKey: [RESOURCE.CUSTOMER, customerId],
        queryFn: () => getSingle<CustomerIF>({ id: Number(customerId), type: RESOURCE.CUSTOMER }),
    });

    // Set up header config
    useEffect(() => {
        updateTitle({
            title: isNew
                ? `${t('new')} ${t('customers.singular')}`
                : `${t('customers.singular')}${customer ? ` - ${customer.name}` : ''}`,
        });
    }, [isNew, customer, t, updateTitle]);
    useEffect(() => {
        const saveButton = {
            label: 'button.save',
            onClick: () => formRef.current && formRef.current.submitSave(),
        };
        const goBackButton = {
            label: 'button.goBack',
            onClick: () => navigate(`${PATHS.CUSTOMERS}${page}`),
            classname: 'secondary',
        };
        const worksheetsButton = {
            label: 'worksheets.plural',
            onClick: () => (customer ? navigate(`${PATHS.WORKSHEETS}1/${customer.id}/1`) : null),
            classname: 'secondary',
        };
        const deleteButton = {
            label: 'button.delete',
            onClick: () =>
                customer
                    ? promptDelete({ id: customer.id, resource: RESOURCE.CUSTOMERS, page })
                    : null,
            classname: 'tertiary',
        };

        updateButtons({
            buttons: [
                saveButton,
                goBackButton,
                ...(customer ? [worksheetsButton] : []),
                ...(customer ? [deleteButton] : []),
            ],
        });
    }, [updateButtons, navigate, page, promptDelete, customer]);

    if (isLoading) return <Loader />;
    if (!isNew && !customer) return <PageNotFound />;

    return (
        <>
            <Header />

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
