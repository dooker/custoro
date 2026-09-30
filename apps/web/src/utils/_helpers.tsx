import { type ReactElement, type ReactNode } from 'react';

interface ConditionalWrapperProps {
    condition: boolean;
    wrapper: (children: ReactNode) => ReactElement;
    children: ReactNode;
}

export const capitalizeFirst = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(email);
};

export const ConditionalWrapper = ({
    condition,
    wrapper,
    children,
}: ConditionalWrapperProps): ReactElement => {
    return condition ? wrapper(children) : <>{children}</>;
};
