import { create } from 'zustand';

type State = {
    title: string;
};

type Action = {
    updateTitle: (title: State['title']) => void;
};

export const useHeadline = create<State & Action>((set) => ({
    title: '',
    updateTitle: (title) => set(() => ({ title })),
}));
