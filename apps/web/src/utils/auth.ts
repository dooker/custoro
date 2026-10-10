// Login, forgot-password and restore-password logic without React, so it can be unit tested.
// useLogin and the Login component only read the form, call these and act on the result.
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '../types/api';
import type { AuthType, CredentialsIF, LoginErrorsIF } from '../types/auth';
import { PATHS, RESOURCE } from '../variables';
import { validateEmail } from './_helpers';

export interface LoginFormValuesIF {
    username: string;
    password: string;
    passwordConfirmation: string;
    // Whether the form shows these fields; a field that is not shown is not required
    hasPasswordField: boolean;
    hasPasswordConfirmationField: boolean;
}

// Same rule as the API: at least 8 characters, at most 72 bytes (bcrypt ignores the rest)
export const minPasswordLength = 8;
export const maxPasswordBytes = 72;

export const isValidNewPasswordLength = (password: string): boolean =>
    password.length >= minPasswordLength &&
    new TextEncoder().encode(password).length <= maxPasswordBytes;

export const emptyLoginErrors: LoginErrorsIF = {
    username: null,
    password: null,
    passwordConfirmation: null,
    api: null,
};

export const validateLoginForm = (
    type: AuthType,
    values: LoginFormValuesIF
): { errors: LoginErrorsIF; isValid: boolean } => {
    const { username, password, passwordConfirmation } = values;
    const errors: LoginErrorsIF = { ...emptyLoginErrors };

    if (type !== RESOURCE.RESTORE) {
        if (!username) {
            errors.username = 'usernameRequired';
        } else if (!validateEmail(username)) {
            errors.username = 'usernameFormat';
        }
    }

    if (type !== RESOURCE.FORGOT && values.hasPasswordField && !password) {
        errors.password = 'passwordRequired';
    }

    if (type === RESOURCE.RESTORE) {
        if (password && !isValidNewPasswordLength(password)) {
            errors.password = 'passwordLength';
        }

        if (values.hasPasswordConfirmationField && !passwordConfirmation) {
            errors.passwordConfirmation = 'passwordRequired';
        }

        if (password !== passwordConfirmation) {
            errors.password = 'passwordsDoNotMatch';
            errors.passwordConfirmation = 'passwordsDoNotMatch';
        }
    }

    const isValid = !errors.username && !errors.password && !errors.passwordConfirmation;

    return { errors, isValid };
};

// Body for the login and forgot requests; restore sends only the new password
export const buildLoginPayload = (
    type: AuthType,
    { username, password }: Pick<LoginFormValuesIF, 'username' | 'password'>
): CredentialsIF['payload'] => {
    if (type === RESOURCE.LOGIN) return { username, password };
    if (type === RESOURCE.FORGOT) return { username };

    return { password };
};

// Restore has its own endpoint (PUT .../token), so it has no URL here
export const getLoginUrl = (apiEndpoint: string, type: AuthType): string | null => {
    const urls: Record<AuthType, string | null> = {
        login: `${apiEndpoint}${PATHS.LOGIN}`,
        forgot: `${apiEndpoint}${PATHS.LOGIN}${RESOURCE.FORGOT}`,
        restore: null,
    };

    return urls[type] ?? null;
};

// Checking a reset link (POST) and saving the new password (PUT) share this URL
export const getResetTokenUrl = (apiEndpoint: string): string =>
    `${apiEndpoint}${PATHS.LOGIN}token`;

export const getApiErrorMessage = (error: AxiosError<ApiErrorResponse>): string =>
    error.response?.data.message || error.message || 'general error';

// Where to go after login: back to the last visited page, unless that was a login page
export const getRedirectAfterLogin = (lastVisitedUrl: string | null): string => {
    const loginPages = [PATHS.LOGIN, PATHS.FORGOT, PATHS.RESTORE];
    const isLoginPage = loginPages.some((path) => lastVisitedUrl?.startsWith(path));

    return isLoginPage ? PATHS.HOME : lastVisitedUrl || PATHS.HOME;
};
