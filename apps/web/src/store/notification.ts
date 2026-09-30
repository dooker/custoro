import { create } from 'zustand';

type State = {
    message: string;
    show: boolean;
    error: boolean;
};

type Action = {
    updateShow: (show: State['show']) => void;
    updateMessage: (message: State['message']) => void;
    updateError: (message: State['error']) => void;
};

export const useNotification = create<State & Action>((set) => ({
    show: false,
    message: '',
    error: false,
    updateShow: (show) => set(() => ({ show })),
    updateMessage: (message) => set(() => ({ message })),
    updateError: (error) => set(() => ({ error })),
}));
