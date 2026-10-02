import { useEffect, useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import Loader from '../_shared/Loader/Loader';
import type { DataResponseIF, ProductIF, WorksheetIF } from '../../types';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import '@css/shared/Form.sass';
import { WorksheetForm } from './WorksheetForm';
import { getMultiple } from '../../utils/Getters/getMultiple';
import { PATHS, RESOURCE } from '../../variables';
import { getSingle } from '../../utils/Getters/getSingle';
import Header from '../_shared/Header/Header';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { CustomerIF } from '../../types/customer';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useButtonsHandler } from '../../hooks/useButtons';

const Worksheet = () => {
    const { customerId, worksheetId, page, worksheetPage } = useParams();
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const isNew = !worksheetId || worksheetId === '0';
    const formRef = useRef<FormHandleIF>(null);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    // fetch worksheet
    const { data: worksheet, isLoading: isWorksheetLoading } = useQuery({
        queryKey: [RESOURCE.WORKSHEET, worksheetId],
        queryFn: () =>
            getSingle<WorksheetIF>({ id: Number(worksheetId), type: RESOURCE.WORKSHEET }),
        enabled: !isNew,
    });

    // TODO - request only if new worksheet
    // fetch customers
    const { data: customersData, isLoading: areCustomersLoading } = useQuery<
        DataResponseIF<CustomerIF>
    >({
        queryKey: [RESOURCE.CUSTOMERS],
        queryFn: () => getMultiple({ path: PATHS.CUSTOMERS }),
    });
    const { resource: customers } = customersData || {};

    // fetch products
    const { data: productsData, isLoading: areProductsLoading } = useQuery<
        DataResponseIF<ProductIF>
    >({
        queryKey: [RESOURCE.PRODUCTS],
        queryFn: () => getMultiple({ path: PATHS.PRODUCTS }),
    });
    const { resource: products } = productsData || {};

    const isEverythingLoading = isWorksheetLoading || areCustomersLoading || areProductsLoading;

    // Set up header config
    useEffect(() => {
        let title = '';

        if (isNew) {
            title = `${t('new')} `;
        }

        title += `${t('worksheets.singular')}`;

        if (!isNew || (isNew && customers && customerId)) {
            const customerName = customers?.find(
                (item: CustomerIF) => item.id === Number(customerId)
            )?.name;

            title += ` ${customerName ? ` - ${customerName}` : ''}`;
        }

        updateTitle({ title });
    }, [t, updateTitle, customers, customerId, isNew]);
    useEffect(() => {
        const saveButton = {
            label: 'button.save',
            onClick: () => formRef.current && formRef.current.submitSave(),
        };
        const goBackButton = {
            label: 'button.goBack',
            onClick: () =>
                navigate(
                    `${PATHS.WORKSHEETS}${page || '1'}/${customerId && worksheetPage ? `${customerId}/${worksheetPage}/` : ''}`
                ),
            classname: 'secondary',
        };

        updateButtons({ buttons: [saveButton, goBackButton] });
    }, [updateButtons, navigate, page, customerId, worksheetPage]);

    if (isEverythingLoading) {
        return <Loader />;
    }

    return (
        <>
            <Header />

            <WorksheetForm
                ref={formRef}
                initialWorksheet={worksheet ?? null}
                customers={customers || []}
                products={products || []}
                isNew={isNew}
            />
        </>
    );
};

export default Worksheet;
