import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getSingle } from '../utils/Getters/getSingle';
import { RESOURCE } from '../variables';

/**
 * The customer or product with this id, for what a picker shows before anything is picked (the
 * pickers only hold the page of matches they searched for). Shares its cache with the customer and
 * product pages. Nothing is asked for without an id.
 *
 * - item: the item with this id, never another one: while a new choice loads it is null, so an
 *   invoice never shows the new customer with the old one's VAT
 * - isLoading: the first load, before there was any item (a form shows a loader)
 * - isPending: this id's item is not there yet, also after a new choice (a form keeps its fields
 *   on screen but holds back what depends on the item, such as the totals)
 */
export const usePickedItem = <T extends { id?: number | string }>(
    type: typeof RESOURCE.CUSTOMER | typeof RESOURCE.PRODUCT,
    id: number | string | null | undefined
) => {
    const hasId = Number(id) > 0;
    const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
        queryKey: [type, String(id)],
        queryFn: () => getSingle<T>({ id: Number(id), type }),
        enabled: hasId,
        // A new choice keeps the form on screen (no first-load loader) while the new item loads
        placeholderData: keepPreviousData,
    });
    const item =
        hasId && data && !isPlaceholderData && Number(data.id) === Number(id) ? data : null;

    return {
        item,
        isLoading: hasId && isLoading,
        isPending: hasId && !item && (isFetching || isLoading),
    };
};
