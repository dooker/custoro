import { useEffect, useRef } from 'react';
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

    // The customer in the path, for the title
    const { item: customer, isLoading: isCustomerLoading } = usePickedItem<CustomerIF>(
        RESOURCE.CUSTOMER,
        customerId
    );

    const isEverythingLoading = isWorksheetLoading || isCustomerLoading;

    // Set up header config
    useEffect(() => {
        let title = '';

        if (isNew) {
            title = `${t('new')} `;
        }

        title += `${t('worksheets.singular')}`;

        const customerName =
            customer && Number(customer.id) === Number(customerId) ? customer.name : '';

        title += ` ${customerName ? ` - ${customerName}` : ''}`;

        updateTitle({ title });
    }, [t, updateTitle, customer, customerId, isNew]);
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

            <WorksheetForm ref={formRef} initialWorksheet={worksheet ?? null} isNew={isNew} />
        </>
    );
};

export default Worksheet;
