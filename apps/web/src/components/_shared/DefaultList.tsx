import Loader from './Loader/Loader';
import Pagination from '@mui/material/Pagination';
import { capitalizeFirst } from '../../utils/_helpers';
import '@css/shared/pagination.sass';
import '@css/shared/Form.sass';
import '@css/shared/GeneralTable.sass';
import { useNavigate, useParams } from 'react-router-dom';
import type { DefaultListIF } from '../../types';
import { RESOURCE } from '../../variables';
import Header from './Header/Header';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';

const DefaultList = ({ list, loader, renderer, meta, path, compact, header }: DefaultListIF) => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { page, customerId, worksheetPage } = useParams();
    const isWorksheetsPerCustomer = list === RESOURCE.WORKSHEETS_PER_CUSTOMER;
    const currentPage = ((worksheetPage || page) as string) || '1';
    const { updateKeyword } = header;

    return (
        <>
            {!compact && <Header updateKeyword={updateKeyword} />}

            <section className={`component ${list}`}>
                {compact && (
                    <header>
                        <h1>
                            {`${t('latest')}`} {capitalizeFirst(t(`${list}.plural`))}
                        </h1>
                    </header>
                )}

                {loader ? (
                    <Loader additionalClass="relative" />
                ) : (
                    <>
                        {renderer()}

                        {meta && !compact && (
                            <Pagination
                                count={meta.total}
                                page={Number(currentPage)}
                                color="primary"
                                onChange={(_event, value) => {
                                    navigate(
                                        `${path}${isWorksheetsPerCustomer ? `${Number(page)}/${customerId}/` : ''}${value}/`
                                    );
                                }}
                            />
                        )}
                    </>
                )}
            </section>
        </>
    );
};

export default DefaultList;
