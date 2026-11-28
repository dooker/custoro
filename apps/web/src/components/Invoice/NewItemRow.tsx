import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { ProductIF } from '../../types';
import SearchSelect from '../_shared/Form/SearchSelect';
import styles from './NewItemRow.module.sass';

interface NewItemRowIF {
    onAdd: (product: ProductIF | undefined) => void;
}

// Adds a product as a new line: the picker searches the products as the user types. It takes the
// row's whole width (it was squeezed into the name column); picking a product closes it (Items).
const NewItemRow = ({ onAdd }: NewItemRowIF) => {
    const { t } = useSafeTranslation();

    return (
        <tr className="row">
            <td className={styles.newItem} colSpan={100}>
                <div className={`field ${styles.picker}`} data-testid="new-item-picker">
                    <SearchSelect<ProductIF>
                        resource="products"
                        name="product-select"
                        clearOnSelect
                        // The items scroll sideways on a phone (InvoiceForm.module.sass)
                        menuPosition="fixed"
                        onSelect={(option) => {
                            if (option) {
                                onAdd(option.item);
                            }
                        }}
                        placeholder={t('products.form.placeholder')}
                    />
                </div>
            </td>
        </tr>
    );
};

export default NewItemRow;
