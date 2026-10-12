import type { FormEvent } from 'react';
import { RESOURCE } from '../variables';

export const AuthTypes = {
    login: RESOURCE.LOGIN,
    forgot: RESOURCE.FORGOT,
    restore: RESOURCE.RESTORE,
} as const;
export type AuthType = (typeof AuthTypes)[keyof typeof AuthTypes];
export interface CredentialsIF {
    type: AuthType;
    payload: {
        username?: string;
        password?: string;
        passwordConfirmation?: string;
    };
}
export interface LoginErrorsIF {
    username: string | null;
    password: string | null;
    passwordConfirmation: string | null;
    api: string | null;
}
export interface OnSubmitIF {
    event: FormEvent;
    type: AuthType;
    token?: string;
}
export interface SetPasswordIF {
    password: string;
    token: string;
}
