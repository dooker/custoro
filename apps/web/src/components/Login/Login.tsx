import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { tokenName, useAuth } from '../../contexts/Auth';
import { lastUrl, PATHS, RESOURCE } from '../../variables';
import { getRedirectAfterLogin } from '../../utils/auth';
import '@css/shared/Modal.sass';
import '@css/shared/Form.sass';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useLogin } from '../../hooks/useLogin';

import Button from '../_shared/Form/Button';
import Field from '../_shared/Form/Field';

const Login = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { isAuth } = useAuth();
    const { usernameRef, passwordRef, onSubmit, isLoading, errors } = useLogin();

    // Redirect Logic
    useEffect(() => {
        if (!isAuth) return;

        setTimeout(() => {
            if (!localStorage.getItem(tokenName)) return;

            navigate(getRedirectAfterLogin(localStorage.getItem(lastUrl)));
        }, 0);
    }, [isAuth, navigate]);

    return (
        <section className="modal large">
            <div className="component modal-content">
                <div className="header">
                    <h1>{t('login.title')}</h1>
                </div>

                <form
                    onSubmit={(event) => onSubmit({ event, type: RESOURCE.LOGIN })}
                    className="general-form white"
                >
                    <Field
                        parent="login"
                        name="username"
                        ref={usernameRef}
                        error={errors.username}
                    />

                    <Field
                        parent="login"
                        name="password"
                        type="password"
                        ref={passwordRef}
                        error={errors.password}
                    />

                    <input type="submit" className="hidden" />
                </form>

                {errors.api && <div className="error">{errors.api}</div>}

                <div className="footer">
                    <Button
                        text={t('button.login')}
                        additionalClassName="large primary"
                        onClick={(event) => onSubmit({ event, type: RESOURCE.LOGIN })}
                        disabled={isLoading}
                        dataTestId="login-submit-button"
                    />
                    <Link to={PATHS.FORGOT}>{t('login.forgot')}</Link>
                </div>
            </div>
        </section>
    );
};

export default Login;
