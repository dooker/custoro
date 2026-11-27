import ListPage from '../_shared/List/ListPage';
import type { ColumnIF } from '../_shared/List/ListTable';
import type { ProductIF } from '../../types';
import { useAuth } from '../../contexts/Auth';
import { formatPrice } from '../../utils/invoiceTotals';
import { PATHS, RESOURCE } from '../../variables';

// Also the small list on Home. "My price" only for people who see discount prices.
export const productColumns = (showDiscount: boolean): ColumnIF<ProductIF>[] => [
    { key: 'code', label: '#', className: 'id' },
    {
        key: 'name',
        label: 'products.form.name',
        className: 'name',
        render: ({ name }) => <span>{name}</span>,
    },
    {
        key: 'price',
        label: 'products.form.price',
        className: 'items',
        render: ({ price }) => formatPrice(price ?? 0),
    },
    ...(showDiscount
        ? [
              {
                  key: 'discountPrice',
                  label: 'products.form.discountPrice',
                  className: 'items wide-only',
                  render: ({ discountPrice }: ProductIF) => formatPrice(discountPrice ?? 0),
              },
          ]
        : []),
    { key: 'unit', label: 'products.form.unit', className: 'items wide-only' },
];

export const productHref = ({ id }: ProductIF, page = 1) => `${PATHS.PRODUCT}${page}/${id}/`;

const Products = () => {
    const { user } = useAuth();

    return (
        <ListPage<ProductIF>
            resource={RESOURCE.PRODUCTS}
            path={PATHS.PRODUCTS}
            title="products.plural"
            columns={productColumns(!!Number(user?.discount))}
            rowHref={productHref}
            addHref={(page) => `${PATHS.PRODUCT}${page}/0/`}
            addTestId="add-product"
            tableClassName="products-table"
            deletable
        />
    );
};

export default Products;
