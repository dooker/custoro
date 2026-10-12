import CreatableSelect from 'react-select/creatable';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import type { DataResponseIF, ProductIF } from '../../types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PATHS, RESOURCE } from '../../variables';
import { getMultiple } from '../../utils/Getters/getMultiple';
import Loader from '../_shared/Loader/Loader';
import styles from './NewItemRow.module.sass';

interface NewItemRowIF {
    onAdd: (product: ProductIF | undefined) => void;
}

const NewItemRow = ({ onAdd }: NewItemRowIF) => {
    const { t } = useSafeTranslation();

    // fetch products
    const { data: products, isLoading } = useQuery<DataResponseIF<ProductIF>, Error, ProductIF[]>({
        queryKey: [RESOURCE.PRODUCTS],
        queryFn: () => getMultiple({ path: PATHS.PRODUCTS }),
        placeholderData: keepPreviousData,
        select: (data): ProductIF[] => data?.resource || [],
    });
    const productsOptions =
        products?.map((item) => ({
            label: `${item.code} - ${item.name}`,
            value: String(item.id),
        })) || [];

    const placeholder = {
        placeholder: t('products.form.placeholder'),
    };

    if (isLoading) {
        return (
            <tr>
                <td colSpan={100}>
                    <Loader />
                </td>
            </tr>
        );
    }

    return (
        <tr className="row">
            <td className="nr"></td>
            <td className={`${styles.newItem} name`}>
                <div className="field">
                    <CreatableSelect
                        className="select"
                        classNamePrefix="select"
                        name="product-select"
                        options={productsOptions}
                        isValidNewOption={() => false}
                        onChange={(item) =>
                            onAdd(
                                products?.filter((product) => product.id === Number(item?.value))[0]
                            )
                        }
                        {...placeholder}
                    />
                </div>
            </td>
            <td colSpan={10}></td>
        </tr>
    );
};

export default NewItemRow;
