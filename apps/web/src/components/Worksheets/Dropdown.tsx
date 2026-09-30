import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { InvoiceIF } from '../../types';
import styles from '@components/_shared/Form/Button.module.sass';

interface DropdownIF {
    addToInvoice: (id?: number) => void;
    lastInvoiceId: number;
    customerInvoices?: InvoiceIF[] | null;
}

const Dropdown = ({ addToInvoice, lastInvoiceId, customerInvoices }: DropdownIF) => {
    const { t } = useSafeTranslation();

    return (
        <div className={styles.buttonDropdown}>
            <ul>
                <li onClick={() => addToInvoice()}>
                    {t('worksheets.newInvoice')} {lastInvoiceId + 1}
                </li>
                {customerInvoices &&
                    customerInvoices.map((item, index) => (
                        <li key={index} onClick={() => addToInvoice(item.id)}>
                            {item.number}
                        </li>
                    ))}
            </ul>
        </div>
    );
};

export default Dropdown;
