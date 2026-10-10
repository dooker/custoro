import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Axios } from '../Axios';
import { tokenName, useAuth } from '../contexts/Auth';
import {
    buildLoginPayload,
    emptyLoginErrors,
    getApiErrorMessage,
    getLoginUrl,
    getResetTokenUrl,
    validateLoginForm,
} from '../utils/auth';
import type { CredentialsIF, LoginErrorsIF, OnSubmitIF, SetPasswordIF } from '../types/auth';
import { useNavigate } from 'react-router';
import { endpoint, RESOURCE } from '../variables';
import type { AxiosError, AxiosResponse } from 'axios';
import type { ApiErrorResponse } from '../types/api';

export const useLogin = () => {
    const { refreshAuth, setErrorMessage } = useAuth();
    const usernameRef = useRef<HTMLInputElement | null>(null);
    const passwordRef = useRef<HTMLInputElement | null>(null);
    const passwordConfirmationRef = useRef<HTMLInputElement | null>(null);
    const [isSent, setIsSent] = useState(false);
    const [errors, setErrors] = useState<LoginErrorsIF>(emptyLoginErrors);
    const tokenUrl = getResetTokenUrl(endpoint);
    const navigate = useNavigate();

    const { mutate: login, isPending: isLoginLoading } = useMutation<
        AxiosResponse,
        AxiosError<ApiErrorResponse>,
        CredentialsIF
    >({
        mutationFn: ({ type, payload }: CredentialsIF) => {
            const url = getLoginUrl(endpoint, type);

            if (!url) {
                return Promise.reject(new Error(`Unknown mutation type: ${type}`));
            }

            return Axios.post(url, payload);
        },
        onSuccess: (resource, variables) => {
            const {
                data: { success, message, token },
            } = resource;
            const { type } = variables;

            if (!success) {
                setErrors((prev) => ({ ...prev, api: message }));
                return;
            }

            if (type === RESOURCE.LOGIN) {
                localStorage.setItem(tokenName, token);
                setErrorMessage(null);
                refreshAuth();
            } else {
                setIsSent(true);
            }
        },
        onError: (error: AxiosError<ApiErrorResponse>) => {
            const msg = getApiErrorMessage(error);
            setErrors((prev) => ({ ...prev, api: msg }));
            setErrorMessage(msg);
        },
    });

    const { mutate: getToken, isPending: isTokenLoading } = useMutation<
        AxiosResponse,
        AxiosError<ApiErrorResponse>,
        string
    >({
        mutationFn: (token: string) => Axios.post(tokenUrl, { token }),
        onSuccess: ({ data: { success } }) => {
            if (!success) {
                setErrors((prev) => ({ ...prev, api: 'login.error.noToken' }));
                return;
            }
        },
        onError: (error: AxiosError<ApiErrorResponse>) => {
            const msg = getApiErrorMessage(error);
            setErrors((prev) => ({ ...prev, api: msg }));
            setErrorMessage(msg);
        },
    });

    const { mutate: setPassword, isPending: isSetPasswordLoading } = useMutation<
        AxiosResponse,
        AxiosError<ApiErrorResponse>,
        SetPasswordIF
    >({
        mutationFn: ({ password, token }: SetPasswordIF) =>
            Axios.put(tokenUrl, { password, token }),
        onSuccess: ({ data: { success, message } }) => {
            if (!success) {
                // The API answers noToken or passwordLength
                const reason = message === 'passwordLength' ? 'passwordLength' : 'noToken';

                setErrors((prev) => ({ ...prev, api: `login.error.${reason}` }));
                return;
            }

            navigate('/');
        },
        onError: (error: AxiosError<ApiErrorResponse>) => {
            const msg = getApiErrorMessage(error);
            setErrors((prev) => ({ ...prev, api: msg }));
            setErrorMessage(msg);
        },
    });

    const onSubmit = ({ event, type, token }: OnSubmitIF) => {
        event.preventDefault();
        const values = {
            username: usernameRef.current?.value || '',
            password: passwordRef.current?.value || '',
            passwordConfirmation: passwordConfirmationRef.current?.value || '',
            hasPasswordField: !!passwordRef.current,
            hasPasswordConfirmationField: !!passwordConfirmationRef.current,
        };
        const { errors: formErrors, isValid } = validateLoginForm(type, values);

        setErrors(formErrors);

        if (!isValid) return;

        if (type === RESOURCE.RESTORE) {
            setPassword({ password: values.password, token: token as string });
        } else {
            login({ type, payload: buildLoginPayload(type, values) });
        }
    };

    return {
        usernameRef,
        passwordRef,
        passwordConfirmationRef,
        onSubmit,
        getToken,
        setPassword,
        isLoading: isLoginLoading || isTokenLoading || isSetPasswordLoading,
        errors,
        isSent,
    };
};
