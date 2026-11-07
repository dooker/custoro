import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { ProductIF } from '../../types';
import SearchSelect from '../_shared/Form/SearchSelect';
import styles from './NewItemRow.module.sass';

interface NewItemRowIF {
    onAdd: (product: ProductIF | undefined) => void;
}

// Adds a product as a new line: the picker searches the products as the user types
const NewItemRow = ({ onAdd }: NewItemRowIF) => {
    const { t } = useSafeTranslation();

    return (
        <tr className="row">
            <td className="nr"></td>
            <td className={`${styles.newItem} name`}>
                <div className="field">
                    <SearchSelect<ProductIF>
                        resource="products"
                        name="product-select"
                        clearOnSelect
                        onSelect={(option) => {
                            if (option) {
                                onAdd(option.item);
                            }
                        }}
                        placeholder={t('products.form.placeholder')}
                    />
                </div>
            </td>
            <td colSpan={10}></td>
        </tr>
    );
};

export default NewItemRow;
