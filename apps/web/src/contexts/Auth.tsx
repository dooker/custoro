import React, {
    createContext,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
    useContext,
    useState,
} from 'react';
import { RESOURCE } from '../variables';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGeneral } from '../utils/Getters/getGeneral';

export const tokenName = 'loginToken';

export interface ProfileIF {
    avatar?: File | null | string;
    discount?: number;
    email: string;
    id?: number | undefined;
    name: string;
    offer?: number;
    role?: string;
    theme: string;
    timestamp?: string;
    // Only in the profile form; never returned by the API
    password?: string;
    currentPassword?: string;
}

interface AuthContextType {
    user: ProfileIF | null;
    isAuth: boolean;
    loading: boolean;
    setUser: Dispatch<SetStateAction<ProfileIF | null>>;
    logout: () => void;
    refreshAuth: () => void;
    errorMessage: string | null;
    setErrorMessage: (msg: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem(tokenName));
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const {
        data: profile,
        isLoading: queryLoading,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: [RESOURCE.PROFILE],
        queryFn: () => getGeneral({ type: RESOURCE.PROFILE, callback: setErrorMessage }),
        enabled: !!token,
        staleTime: Infinity,
    });

    const logout = () => {
        localStorage.removeItem(tokenName);
        setToken(null);

        void queryClient.removeQueries({ queryKey: [RESOURCE.PROFILE] });
        queryClient.clear();
    };

    // Manually trigger the useQuery to update
    const refreshAuth = () => {
        void refetch();
    };

    return (
        <AuthContext.Provider
            value={{
                user: profile || null,
                isAuth: !!profile,
                loading: token ? queryLoading : false,
                setUser: () => {}, // You manual setter for Context to spread updated info
                logout,
                refreshAuth,
                errorMessage: isError ? (error as Error).message : errorMessage || null,
                setErrorMessage,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }

    return context;
};
