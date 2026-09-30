import { create } from 'zustand';
import type { ListButtonIF } from '../types/header';

type State = {
    buttons: ListButtonIF[] | null;
};

type Action = {
    updateButtons: (buttons: State['buttons']) => void;
};

export const useButtons = create<State & Action>((set) => ({
    buttons: null,
    updateButtons: (buttons) => set(() => ({ buttons })),
}));
