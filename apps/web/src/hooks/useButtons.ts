import { useButtons } from '../store/buttons';
import type { ListButtonIF } from '../types/header';

export const useButtonsHandler = () => {
    const updateButtons = useButtons((state) => state.updateButtons);

    return ({ buttons }: { buttons: ListButtonIF[] | null }) => {
        updateButtons(buttons);
    };
};
