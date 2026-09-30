import { create } from 'zustand';
import type { ConfirmationActionIF, ConfirmationIcon, ConfirmationStateIF } from '../types/store';

export const useConfirmation = create<ConfirmationStateIF & ConfirmationActionIF>((set) => ({
    show: false,
    title: '',
    text: '',
    params: {
        resource: '',
    },
    callback: () => {},
    Icon: null as ConfirmationIcon,
    showResource: true,

    updateShow: (show) => set(() => ({ show })),
    updateTitle: (title) => set(() => ({ title })),
    updateText: (text) => set(() => ({ text })),
    updateParams: (params) => set(() => ({ params })),
    updateCallback: (callback) => set(() => ({ callback })),
    updateIcon: (Icon) => set(() => ({ Icon })),
    updateShowResource: (showResource) => set(() => ({ showResource })),
}));
