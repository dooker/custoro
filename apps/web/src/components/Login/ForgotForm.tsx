import { type RefObject } from 'react';
import '@css/shared/Form.sass';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { Link } from 'react-router-dom';
import type { LoginErrorsIF, OnSubmitIF } from '../../types/auth';
import { PATHS, RESOURCE } from '../../variables';

import Field from '../_shared/Form/Field';
import Button from '../_shared/Form/Button';

interface ForgotFormIF {
    onSubmit: (params: OnSubmitIF) => void;
    usernameRef: RefObject<HTMLInputElement | null>;
    errors: LoginErrorsIF;
    isLoading: boolean;
}

const ForgotForm = ({ onSubmit, usernameRef, errors, isLoading }: ForgotFormIF) => {
    const { t } = useSafeTranslation();

    return (
        <>
            <form
                onSubmit={(event) => onSubmit({ event, type: RESOURCE.FORGOT })}
                className="general-form white"
            >
                <Field parent="login" name="username" ref={usernameRef} error={errors.username} />

                <input type="submit" className="hidden" />
            </form>

            {errors.api && <div className="error">{errors.api}</div>}

            <div className="footer">
                <Button
                    text={t('button.send')}
                    additionalClassName="large primary"
                    onClick={(event) => onSubmit({ event, type: RESOURCE.FORGOT })}
                    disabled={isLoading}
                />

                <Link to={PATHS.LOGIN}>{t('login.login')}</Link>
            </div>
        </>
    );
};

export default ForgotForm;
