import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getSingle } from '../utils/Getters/getSingle';
import { RESOURCE } from '../variables';

/**
 * The customer or product with this id, for what a picker shows before anything is picked (the
 * pickers only hold the page of matches they searched for). Shares its cache with the customer and
 * product pages. Nothing is asked for without an id. While another id loads, the item before it
 * is given, so callers compare ids before they trust it.
 */
export const usePickedItem = <T>(
    type: typeof RESOURCE.CUSTOMER | typeof RESOURCE.PRODUCT,
    id: number | string | null | undefined
) => {
    const hasId = Number(id) > 0;
    const { data, isLoading } = useQuery({
        queryKey: [type, String(id)],
        queryFn: () => getSingle<T>({ id: Number(id), type }),
        enabled: hasId,
        // A new choice keeps the form on screen while the new item loads
        placeholderData: keepPreviousData,
    });

    return { item: hasId ? (data ?? null) : null, isLoading: hasId && isLoading };
};
