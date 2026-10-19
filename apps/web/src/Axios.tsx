import axios from 'axios';
import { tokenName } from './contexts/Auth';
import { sessionEndedEvent } from './variables';
import { isSessionEndResponse } from './utils/auth';
// No baseURL: every call already prefixes `${endpoint}`, and a baseURL would double a relative endpoint (/api/api/...)
export const Axios = axios.create();

Axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem(tokenName);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// The API refuses an old token with HTTP 200 and success:false. Left alone, every save would then
// fail without a word and the forms would look saved, so the session is ended instead (see
// useSessionEnd). Only while a token is stored: calls without one (login, forgot password) never
// mean "session over".
Axios.interceptors.response.use((response) => {
    if (isSessionEndResponse(response.data) && localStorage.getItem(tokenName)) {
        window.dispatchEvent(new Event(sessionEndedEvent));
    }

    return response;
});
