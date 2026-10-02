import { ComponentType, lazy, MouseEventHandler, type Ref } from 'react';
import styles from './Button.module.sass';

interface ButtonIF {
    ref?: Ref<HTMLButtonElement>;
    additionalClassName: string;
    text?: string;
    Element?: ComponentType;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    loading?: true;
    disabled?: boolean;
    dataTestId?: string;
}

const Loader = lazy(() => import('../Loader/Loader'));

const Button = ({
    additionalClassName,
    text,
    Element,
    onClick,
    loading,
    disabled,
    dataTestId,
    ref,
}: ButtonIF) => {
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
        ref,
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
};

export default Button;
