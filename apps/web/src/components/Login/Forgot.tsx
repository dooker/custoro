import { lazy } from 'react';
import Loader from '../_shared/Loader/Loader';
import '@css/shared/Form.sass';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useLogin } from '../../hooks/useLogin';

const Sent = lazy(() => import('./Sent'));
const ForgotForm = lazy(() => import('./ForgotForm'));

const Forgot = () => {
    const { t } = useSafeTranslation();
    const { usernameRef, onSubmit, isLoading, errors, isSent } = useLogin();

    if (isLoading) return <Loader />;

    return (
        <section className="modal large">
            {isSent}
            <div className="component modal-content">
                <div className="header">
                    <h1>{t('login.forgotTitle')}</h1>
                </div>

                {isSent ? (
                    <Sent />
                ) : (
                    <ForgotForm
                        onSubmit={onSubmit}
                        errors={errors}
                        usernameRef={usernameRef}
                        isLoading={isLoading}
                    />
                )}
            </div>
        </section>
    );
};

export default Forgot;
