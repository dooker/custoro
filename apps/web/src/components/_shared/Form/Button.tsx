import { ComponentType, forwardRef, lazy, MouseEventHandler, RefObject, useRef } from 'react';
import styles from './Button.module.sass';

interface ButtonIF {
    additionalClassName: string;
    text?: string;
    Element?: ComponentType;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    loading?: true;
    disabled?: boolean;
    dataTestId?: string;
}

const Loader = lazy(() => import('../Loader/Loader'));

const Button = forwardRef(
    (
        { additionalClassName, text, Element, onClick, loading, disabled, dataTestId }: ButtonIF,
        ref
    ) => {
        const buttonRef = useRef(null);

        if (!text && !Element) {
            return null;
        }

        const extraClasses =
            additionalClassName
                ?.split(' ')
                .map((key) => styles[key])
                .filter(Boolean) ?? [];

        const className = [
            styles.button,
            loading ? styles.loading : '',
            Element ? styles.icon : '',
            ...extraClasses,
        ]
            .filter(Boolean)
            .join(' ');

        const params = {
            className,
            type: 'button' as const,
            ref: ref ? (ref as RefObject<HTMLButtonElement>) : buttonRef,
            ...(onClick ? { onClick } : null),
            ...(disabled ? { disabled: true } : null),
            ...(dataTestId ? { 'data-testid': dataTestId } : null),
        };

        return (
            <button {...params}>
                {text && <span>{text}</span>}
                {Element && <Element />}

                {loading && <Loader additionalClass="button" />}
            </button>
        );
    }
);

Button.displayName = 'Button';

export default Button;
