import { lazy } from 'react';
import { type ParseKeys, t } from 'i18next';
import type { FieldIF } from '../../../types/form';
import styles from '@components/_shared/Form/Error.module.sass';

const FormElements = {
    select: lazy(() => import('./Select')),
    textarea: lazy(() => import('./Textarea')),
    text: lazy(() => import('./Text')),
    rte: lazy(() => import('./Rte')),
    image: lazy(() => import('./Image')),
    toggle: lazy(() => import('./Toggle')),
};

const Field = (props: FieldIF) => {
    const { parent, name, type, error } = props;
    const elementType = (type || 'text') as keyof typeof FormElements;
    const FormElement = FormElements[elementType] || FormElements.text;
    const translation = {
        label: `${parent}.form.${name}` as string & ParseKeys,
        error: `${parent}.form.${error}` as string & ParseKeys,
    };

    return (
        <div
            className={`field${type === 'password' || type === 'image' ? ` ${type}-field` : ''}${error ? ` error ${styles.error}` : ''}`}
        >
            <label htmlFor={type === 'image' || type === 'toggle' ? undefined : name}>
                {t(translation.label)}
            </label>

            <FormElement {...props} />

            {error && <div className={styles.error}>{t(translation.error)}</div>}
        </div>
    );
};

export default Field;
