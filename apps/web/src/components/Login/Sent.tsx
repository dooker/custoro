import '@css/shared/Form.sass';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { Link } from 'react-router-dom';
import { PATHS } from '../../variables';

const Sent = () => {
    const { t } = useSafeTranslation();

    return (
        <>
            <div className="general-form white">{t('login.forgotSent')}</div>

            <div className="footer">
                <Link to={PATHS.LOGIN}>{t('login.login')}</Link>
            </div>
        </>
    );
};

export default Sent;
