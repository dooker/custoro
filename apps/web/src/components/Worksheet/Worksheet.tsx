import { useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import Loader from '../_shared/Loader/Loader';
import type { WorksheetIF } from '../../types';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import '@css/shared/Form.sass';
import { WorksheetForm } from './WorksheetForm';
import { usePickedItem } from '../../hooks/usePickedItem';
import { PATHS, RESOURCE } from '../../variables';
import { getSingle } from '../../utils/Getters/getSingle';
import Header from '../_shared/Header/Header';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { CustomerIF } from '../../types/customer';
import { usePageParam } from '../../hooks/usePageParam';
import { useListReturn } from '../../hooks/useListReturn';

const Worksheet = () => {
    const { customerId, worksheetId, worksheetPage: rawWorksheetPage } = useParams();
    const page = usePageParam();
    // The list's search and page size, kept on the way back to it
    const { keep } = useListReturn(PATHS.WORKSHEETS);
    const worksheetPageNumber = usePageParam('worksheetPage');
    // Only the customer's worksheet list has a page of its own in the address
    const worksheetPage = rawWorksheetPage ? worksheetPageNumber : undefined;
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const isNew = !worksheetId || worksheetId === '0';
    const formRef = useRef<FormHandleIF>(null);

    // fetch worksheet
    const { data: worksheet, isLoading: isWorksheetLoading } = useQuery({
        queryKey: [RESOURCE.WORKSHEET, worksheetId],
        queryFn: () =>
            getSingle<WorksheetIF>({ id: Number(worksheetId), type: RESOURCE.WORKSHEET }),
        enabled: !isNew,
    });

    // The customer in the path, for the title
    const { item: customer, isLoading: isCustomerLoading } = usePickedItem<CustomerIF>(
        RESOURCE.CUSTOMER,
        customerId
    );

    const isEverythingLoading = isWorksheetLoading || isCustomerLoading;

    const customerName =
        customer && Number(customer.id) === Number(customerId) ? customer.name : '';
    const title = `${isNew ? `${t('new')} ` : ''}${t('worksheets.singular')}${customerName ? ` - ${customerName}` : ''}`;
    const buttons = [
        {
            label: 'button.save',
            onClick: () => formRef.current?.submitSave(),
        },
        {
            label: 'button.goBack',
            onClick: () =>
                navigate(
                    keep(
                        `${PATHS.WORKSHEETS}${page}/${customerId && worksheetPage ? `${customerId}/${worksheetPage}/` : ''}`
                    )
                ),
            classname: 'secondary',
        },
    ];

    if (isEverythingLoading) {
        return <Loader />;
    }

    return (
        <>
            <Header title={title} buttons={buttons} />

            <WorksheetForm ref={formRef} initialWorksheet={worksheet ?? null} isNew={isNew} />
        </>
    );
};

export default Worksheet;
