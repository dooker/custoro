import { PATHS, RESOURCE } from '../../variables';
import DefaultList from '../_shared/DefaultList';
import NoEntries from '../_shared/NoEntries/NoEntries';
import type { DataResponseIF, WorksheetIF } from '../../types';
import { useNavigate, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Loader from '../_shared/Loader/Loader';
import { getMultiple } from '../../utils/Getters/getMultiple';
import { useKeyword } from '../../hooks/useKeyword';
import { getSearch } from '../../utils/Getters/getSearch';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { visibleRowCount } from '../../shared/helpers';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import { useEffect } from 'react';
import { useButtonsHandler } from '../../hooks/useButtons';
import type { HeaderIF } from '../../types/header';

interface WorksheetsIF {
    compact?: boolean;
}

const Worksheets = ({ compact }: WorksheetsIF) => {
    const page = Number(useParams().page) || 1;
    const navigate = useNavigate();
    const { t } = useSafeTranslation();
    const { keyword, updateKeyword } = useKeyword();
    const limit = visibleRowCount(compact);
    const updateTitle = useHeadlineHandler();
    const updateButtons = useButtonsHandler();

    // Set up header config
    useEffect(() => {
        updateTitle({ title: t('worksheets.plural') });
    }, [t, updateTitle]);
    useEffect(() => {
        const searchButton = {
            label: 'button.search',
        };
        const addButton = {
            label: 'button.add',
            onClick: () => navigate(`${PATHS.WORKSHEET}${page}/0/`),
        };

        updateButtons({ buttons: [searchButton, addButton] });
    }, [updateButtons, navigate, page]);
    const header: HeaderIF = {
        keyword: '',
        updateKeyword: updateKeyword,
    };

    // fetch worksheets
    const { data, isLoading: loading } = useQuery<DataResponseIF<WorksheetIF>>({
        queryKey: [RESOURCE.WORKSHEETS, limit, page, compact, keyword],
        queryFn: () => {
            if (keyword) {
                return getSearch({ keyword, resource: RESOURCE.WORKSHEETS, page, limit });
            }

            return getMultiple({ path: PATHS.WORKSHEETS, page, compact, limit });
        },
        placeholderData: keepPreviousData,
    });
    const { resource: worksheets, meta } = data || {};

    const showTable = () => {
        if (!worksheets) {
            return '';
        }

        const handleViewClick = (id: number) => {
            navigate(`${PATHS.WORKSHEETS}${page}/${id}/1/`);
        };

        return Object.values(worksheets).map((item: WorksheetIF, index) => {
            const { id, worksheet_count, name } = item;

            return (
                <tr className="row" key={index}>
                    <td onClick={() => handleViewClick(id)} className="name">
                        {name}
                    </td>
                    <td onClick={() => handleViewClick(id)} className="items">
                        {worksheet_count}
                    </td>
                </tr>
            );
        });
    };

    const showList = () => {
        if (!worksheets?.length) {
            return <NoEntries />;
        }

        return (
            <table className={`general-table worksheet-table${compact ? ' compact' : ''}`}>
                <thead>
                    <tr>
                        <th className="name">{t('worksheets.form.customer')}</th>
                        <th className="items">{t('worksheets.form.products')}</th>
                    </tr>
                </thead>
                <tbody>{showTable()}</tbody>
            </table>
        );
    };

    if (loading) {
        return <Loader />;
    }

    return (
        <DefaultList
            list={RESOURCE.WORKSHEETS}
            loader={loading}
            renderer={showList}
            meta={meta}
            compact={compact}
            path={PATHS.WORKSHEETS}
            header={header}
        />
    );
};

export default Worksheets;
