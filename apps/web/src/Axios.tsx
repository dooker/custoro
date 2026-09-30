import axios from 'axios';
import { tokenName } from './contexts/Auth';
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
