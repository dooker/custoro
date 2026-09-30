export interface PromptDeleteIF {
    resource: string;
    id?: number;
    page?: number;
    customer?: number;
    parentPage?: number;
    cache?: () => void;
    callback?: () => void;
    invalidators?: string[][];
}

type ConfirmationIcon = 'delete' | 'paid' | null;
export interface ConfirmationStateIF {
    show: boolean;
    title: string;
    text: string;
    params?: PromptDeleteIF | undefined;
    callback: (params: PromptDeleteIF | undefined) => void;
    Icon: ConfirmationIcon;
    showResource: boolean;
}

type ConfirmationCallback = (params?: PromptDeleteIF) => void;
export type ConfirmationActionIF = {
    updateShow: (show: boolean) => void;
    updateTitle: (message: string) => void;
    updateText: (text: string) => void;
    updateParams: ConfirmationCallback;
    updateCallback: (callback: ConfirmationCallback) => void;
    updateIcon: (icon: ConfirmationIcon) => void;
    updateShowResource: (showResource: boolean) => void;
};

interface NotificationStateIF {
    success: boolean;
    message?: string | undefined;
    invalidator?: () => Promise<void>;
    show?: boolean | undefined;
}
export type NotificationActionIF = {
    updateShow: (show: boolean) => void;
    updateMessage: (message: string) => void;
    updateError: (error: boolean) => void;
};

export interface HeadlineStateIF {
    title: string;
}
export type HeadlineActionIF = {
    updateTitle: (title: string) => void;
};
