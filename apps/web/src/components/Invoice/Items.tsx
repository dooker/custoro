import { useState } from 'react';
import type { InvoiceItemsIF, InvoiceProductIF, ProductIF } from '../../types';
import Button from '../_shared/Form/Button';
import { useAuth } from '../../contexts/Auth';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import '@css/shared/GeneralTable.sass';
import NewItemRow from './NewItemRow';
import { ItemRow } from './ItemRow';
import styles from './Items.module.sass';

const Items = ({ draft, onChange, onAdd }: InvoiceItemsIF) => {
    const { t } = useSafeTranslation();
    const { user } = useAuth();
    const { discount } = user || {};
    const [newItem, setNewItem] = useState(false);
    const { items, locked } = draft || {};
    const isLocked = locked === 1;

    const handleOnAdd = (product: ProductIF | undefined) => {
        setNewItem((prev) => !prev);

        if (product) {
            onAdd(product);
        }
    };

    if (!items) {
        return null;
    }

    return (
        <>
            <thead>
                <tr>
                    <th className="nr">#</th>
                    <th className="name">{t('invoices.form.name')}</th>
                    <th className="items">{t('invoices.form.unit')}</th>
                    <th className="items">{t('invoices.form.quantity')}</th>
                    <th className="items">{t('invoices.form.price')}</th>
                    {discount ? <th className="items">{t('invoices.form.discountPrice')}</th> : ''}
                    <th className="items">{t('invoices.form.total')}</th>
                    {discount ? <th className="items">{t('invoices.form.discountTotal')}</th> : ''}
                    {!isLocked && <th className="actions" />}
                </tr>
            </thead>

            <tbody className={styles.item}>
                {items &&
                    Object.values(items).map((item: InvoiceProductIF, index) => {
                        return (
                            <ItemRow
                                onChange={onChange}
                                item={item}
                                index={index}
                                key={index}
                                invoiceIsLocked={isLocked}
                            />
                        );
                    })}

                {newItem && <NewItemRow onAdd={handleOnAdd} />}

                {!isLocked && (
                    <tr>
                        <td className={styles.addNew} colSpan={100}>
                            <Button
                                text={t('button.add')}
                                additionalClassName="small primary"
                                onClick={() => setNewItem((prev) => !prev)}
                            />
                        </td>
                    </tr>
                )}
            </tbody>
        </>
    );
};

export default Items;
