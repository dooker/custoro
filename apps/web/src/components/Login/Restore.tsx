import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import '@css/shared/Modal.sass';
import '@css/shared/Form.sass';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useLogin } from '../../hooks/useLogin';
import { PATHS, RESOURCE } from '../../variables';

import Button from '../_shared/Form/Button';
import Field from '../_shared/Form/Field';
import DOMPurify from 'dompurify';

const Restore = () => {
    const { t } = useSafeTranslation();
    const { token } = useParams();
    const { passwordRef, passwordConfirmationRef, onSubmit, getToken, isLoading, errors } =
        useLogin();

    useEffect(() => {
        getToken(token as string);
    }, [token, getToken]);

    const cleanHtml = errors.api ? DOMPurify.sanitize(t(errors.api)) : '';

    return (
        <section className="modal large">
            <div className="component modal-content">
                <div className="header">
                    <h1>{t('login.forgotTokenTitle')}</h1>
                </div>

                <form
                    onSubmit={(event) => onSubmit({ event, type: RESOURCE.RESTORE, token })}
                    className="general-form white"
                >
                    <Field
                        parent="login"
                        name="password"
                        type="password"
                        ref={passwordRef}
                        error={errors.password}
                    />

                    <Field
                        parent="login"
                        name="passwordConfirmation"
                        type="password"
                        ref={passwordConfirmationRef}
                        error={errors.passwordConfirmation}
                    />

                    <input type="submit" className="hidden" />
                </form>

                {errors.api && (
                    <div className="error" dangerouslySetInnerHTML={{ __html: cleanHtml }} />
                )}

                <div className="footer">
                    <Button
                        text={t('button.save')}
                        additionalClassName="large primary"
                        onClick={(event) => onSubmit({ event, type: RESOURCE.RESTORE, token })}
                        disabled={isLoading || !!errors.api}
                    />

                    <Link to={PATHS.LOGIN}>{t('login.login')}</Link>
                </div>
            </div>
        </section>
    );
};

export default Restore;
