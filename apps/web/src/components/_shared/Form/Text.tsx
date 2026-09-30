import { forwardRef, lazy, useState } from 'react';
import type { FieldIF } from '../../../types/form';

const View = lazy(() => import('../Icons/View'));

const Text = forwardRef<HTMLInputElement, FieldIF>(
    ({ name, value, onChange, type, placeholder }, ref) => {
        const password = 'password';
        const isPassword = type === password;
        const [passwordFieldType, setPasswordFieldType] = useState(password);

        const toggleFieldType = () => {
            setPasswordFieldType((prev) => (prev === password ? 'text' : password));
        };

        return (
            <>
                <input
                    ref={ref}
                    name={name}
                    id={name}
                    type={isPassword ? passwordFieldType : type}
                    defaultValue={isPassword ? '' : (value as string)}
                    onChange={(e) => (onChange ? onChange({ name, value: e.target.value }) : null)}
                    placeholder={placeholder}
                    autoComplete={isPassword ? 'new-password' : undefined}
                />

                {isPassword && (
                    <>
                        <View callback={toggleFieldType} />

                        {passwordFieldType !== password && (
                            <svg viewBox="0 0 100 100" className="hollow">
                                <line
                                    x1="0"
                                    y1="80"
                                    x2="100"
                                    y2="20"
                                    strokeWidth="4"
                                    stroke="black"
                                />
                            </svg>
                        )}
                    </>
                )}
            </>
        );
    }
);

Text.displayName = 'Text';

export default Text;
