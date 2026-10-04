import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { tokenName, useAuth } from '../../contexts/Auth';
import { lastUrl, PATHS, RESOURCE } from '../../variables';
import '@css/shared/Modal.sass';
import '@css/shared/Form.sass';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useLogin } from '../../hooks/useLogin';

import Button from '../_shared/Form/Button';
import Field from '../_shared/Form/Field';
import { useNotificationHandler } from '../../hooks/useNotificationHandler';

const Login = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { isAuth, authMessage, setAuthMessage } = useAuth();
    const { usernameRef, passwordRef, onSubmit, isLoading, errors } = useLogin();
    const notification = useNotificationHandler();

    // Redirect Logic
    useEffect(() => {
        if (!isAuth) return;

        setTimeout(() => {
            const ignoreLastUrl = [PATHS.LOGIN, PATHS.FORGOT, PATHS.RESTORE];
            const navigateTo = localStorage.getItem(lastUrl);
            const shouldIgnore = ignoreLastUrl.some((path) => navigateTo?.startsWith(path));

            if (!localStorage.getItem(tokenName)) return;

            navigate(shouldIgnore ? PATHS.HOME : navigateTo || PATHS.HOME);
        }, 0);
    }, [isAuth, navigate]);

    // Notification Logic
    useEffect(() => {
        if (!authMessage) return;

        void notification({
            success: false,
            message: authMessage,
            show: true,
        });

        setAuthMessage(null);
        localStorage.removeItem(tokenName);
    }, [authMessage, notification, setAuthMessage]);

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
