import type { FieldIF } from '../../../types/form';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useState } from 'react';
import style from './Toggle.module.sass';

const Toggle = ({ toggle, parent }: FieldIF) => {
    const { t } = useSafeTranslation();

    const [isOptionA, setIsOptionA] = useState(toggle ? toggle.initial === toggle.items[0] : true);

    if (!toggle) {
        return null;
    }

    const { items, onChange } = toggle;
    const optionA = t(`${parent}.form.${items[0]}`);
    const optionB = t(`${parent}.form.${items[1]}`);

    return (
        <div
            className={style.toggleContainer}
            onClick={() => {
                setIsOptionA(!isOptionA);
                onChange(isOptionA ? items[1] : items[0]);
            }}
        >
            <div className={style.toggle + ' ' + (isOptionA ? style.left : style.right)}>
                <span>{isOptionA ? optionA : optionB}</span>
            </div>

            <div className={style.label}>{optionA}</div>
            <div className={style.label}>{optionB}</div>
        </div>
    );
};

export default Toggle;
