import sadServer from '../../assets/images/sad-server.webp';
import '@css/shared/Modal.sass';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';

interface BigErrorIF {
    type?: string;
}

const BiggerError = ({ type }: BigErrorIF) => {
    const { t } = useSafeTranslation();

    const selector = type === 'pdf' ? 'pdfError' : 'bigError';

    return (
        <section className="modal large">
            <div className="overlay"></div>
            <div className="component modal-content">
                <div className="header">
                    <h1>{t(`modal.${selector}.header`)}</h1>
                </div>

                <img src={sadServer as string} alt={t('modal.bigError.imageAlt')} />

                <div className="footer">{t(`modal.${selector}.footer`)}</div>
            </div>
        </section>
    );
};

export default BiggerError;
