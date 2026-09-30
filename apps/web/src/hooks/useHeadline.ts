import { useHeadline } from '../store/headline';
import type { HeadlineStateIF } from '../types/store';

export const useHeadlineHandler = () => {
    const updateTitle = useHeadline((state) => state.updateTitle);

    return ({ title }: HeadlineStateIF) => {
        updateTitle(title);
    };
};
