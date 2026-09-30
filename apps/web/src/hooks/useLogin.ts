import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Axios } from '../Axios';
import { tokenName, useAuth } from '../contexts/Auth';
import { validateEmail } from '../utils/_helpers';
import type { CredentialsIF, LoginErrorsIF, OnSubmitIF, SetPasswordIF } from '../types/auth';
import { useNavigate } from 'react-router-dom';
import { endpoint, PATHS, RESOURCE } from '../variables';
import type { AxiosError, AxiosResponse } from 'axios';
import type { ApiErrorResponse } from '../types/api';

export const useLogin = () => {
    const { refreshAuth, setErrorMessage } = useAuth();
    const usernameRef = useRef<HTMLInputElement | null>(null);
    const passwordRef = useRef<HTMLInputElement | null>(null);
    const passwordConfirmationRef = useRef<HTMLInputElement | null>(null);
    const [isSent, setIsSent] = useState(false);
    const [errors, setErrors] = useState<LoginErrorsIF>({
        username: null,
        password: null,
        passwordConfirmation: null,
        api: null,
    });
    const tokenUrl = `${endpoint}${PATHS.LOGIN}/token`;
    const navigate = useNavigate();

    const { mutate: login, isPending: isLoginLoading } = useMutation<
        AxiosResponse,
        AxiosError<ApiErrorResponse>,
        CredentialsIF
    >({
        mutationFn: ({ type, payload }: CredentialsIF) => {
            const paths = {
                forgot: `${endpoint}${PATHS.LOGIN}${PATHS.FORGOT}`,
                login: `${endpoint}${PATHS.LOGIN}`,
                restore: null,
            };
            const url = paths[type];

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
            const msg = error.response?.data.message || error.message || 'general error';
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
            const msg = error.response?.data.message || error.message || 'general error';
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
        onSuccess: ({ data: { success } }) => {
            if (!success) {
                setErrors((prev) => ({ ...prev, api: 'login.error.noToken' }));
                return;
            }

            navigate('/');
        },
        onError: (error: AxiosError<ApiErrorResponse>) => {
            const msg = error.response?.data.message || error.message || 'general error';
            setErrors((prev) => ({ ...prev, api: msg }));
            setErrorMessage(msg);
        },
    });

    const onSubmit = ({ event, type, token }: OnSubmitIF) => {
        event.preventDefault();
        const username = usernameRef.current?.value || '';
        const password = passwordRef.current?.value || '';
        const passwordConfirmation = passwordConfirmationRef.current?.value || '';

        // Reset errors
        setErrors({ username: null, password: null, passwordConfirmation: null, api: null });

        let hasError = false;
        if (type !== RESOURCE.RESTORE) {
            if (!username) {
                setErrors((prev) => ({ ...prev, username: 'usernameRequired' }));
                hasError = true;
            } else if (!validateEmail(username)) {
                setErrors((prev) => ({ ...prev, username: 'usernameFormat' }));
                hasError = true;
            }
        }

        if (type !== RESOURCE.FORGOT) {
            if (passwordRef.current && !password) {
                setErrors((prev) => ({ ...prev, password: 'passwordRequired' }));
                hasError = true;
            }
        }

        if (type === RESOURCE.RESTORE) {
            if (passwordConfirmationRef.current && !passwordConfirmation) {
                setErrors((prev) => ({ ...prev, passwordConfirmation: 'passwordRequired' }));
                hasError = true;
            }

            if (password !== passwordConfirmation) {
                setErrors((prev) => ({
                    ...prev,
                    password: 'passwordsDoNotMatch',
                    passwordConfirmation: 'passwordsDoNotMatch',
                }));
                hasError = true;
            }
        }

        const payload = {
            ...(type !== RESOURCE.RESTORE ? { username } : {}),
            ...(type !== RESOURCE.FORGOT ? { password } : {}),
            ...(type === RESOURCE.RESTORE ? { password } : {}),
        };

        if (!hasError) {
            if (type === RESOURCE.RESTORE) {
                setPassword({ password, token: token as string });
            } else {
                login({ type, payload });
            }
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
