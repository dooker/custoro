import { useConfirmation } from '../store/confirmation';
import type { ConfirmationStateIF } from '../types/store';

export const useConfirmationHandler = () => {
    const updateShow = useConfirmation((state) => state.updateShow);
    const updateTitle = useConfirmation((state) => state.updateTitle);
    const updateText = useConfirmation((state) => state.updateText);
    const updateParams = useConfirmation((state) => state.updateParams);
    const updateCallback = useConfirmation((state) => state.updateCallback);
    const updateIcon = useConfirmation((state) => state.updateIcon);
    const updateShowResource = useConfirmation((state) => state.updateShowResource);

    return ({ show, title, text, params, callback, Icon, showResource }: ConfirmationStateIF) => {
        updateShow(show);
        updateTitle(title);
        updateText(text);
        updateParams(params || undefined);
        updateCallback(callback);
        updateIcon(Icon);
        updateShowResource(showResource);
    };
};
