import { RefObject, useRef, useState } from 'react';
import { useImage } from '../../../hooks/useImage';
import { endpoint } from '../../../variables';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useDeleteItem } from '../../../hooks/useDeleteItem';
import Button from './Button';
import type { FieldIF } from '../../../types/form';

const Image = ({
    name,
    value,
    onChange,
    resource: rawResource,
    callback,
    callbackParam,
    invalidators,
    ref,
}: FieldIF) => {
    const { t } = useSafeTranslation();
    const resource = rawResource || '';
    const [preview, setPreview] = useState<string | null>(null);
    const { promptDelete } = useDeleteItem([resource]);
    const imageRef = useRef<HTMLInputElement>(null);
    const inputRef = ref ? (ref as RefObject<HTMLInputElement>) : imageRef;

    const localCallback = () => {
        setPreview(null);

        if (callback) {
            callback();
        }
    };

    const handleChange = (value?: File) => {
        setPreview(value ? URL.createObjectURL(value) : null);

        if (onChange) {
            onChange({ name, value: value || null });
        }
    };

    return (
        <div className="image-container">
            {useImage({
                src: preview ? preview : value ? `${endpoint}/uploads/${value}` : undefined,
                alt: 'Logo',
            })}

            {value ? (
                <Button
                    text={t('button.delete')}
                    additionalClassName="small tertiary"
                    onClick={() =>
                        promptDelete({
                            id: callbackParam,
                            resource,
                            callback: localCallback,
                            invalidators,
                        })
                    }
                />
            ) : (
                <>
                    <Button
                        additionalClassName="primary small"
                        text={t('button.upload')}
                        onClick={() => inputRef?.current?.click()}
                    ></Button>

                    <input
                        type="file"
                        accept="image/*"
                        id={name}
                        onChange={(event) => handleChange(event.target.files?.[0] as File)}
                        className="image-upload"
                        ref={inputRef}
                    />
                </>
            )}
        </div>
    );
};

export default Image;
