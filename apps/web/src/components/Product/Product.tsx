import { ProductForm } from './ProductForm';
import { useNavigate, useParams } from 'react-router';
import type { ProductIF } from '../../types';
import { getSingle } from '../../utils/Getters/getSingle';
import Loader from '../_shared/Loader/Loader';
import PageNotFound from '../PageNotFound/PageNotFound';
import { useQuery } from '@tanstack/react-query';
import '@css/shared/Form.sass';
import { PATHS, RESOURCE } from '../../variables';
import Header from '../_shared/Header/Header';
import { useRef } from 'react';
import type { FormHandleIF } from '../../types/form';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { usePageParam } from '../../hooks/usePageParam';

const Product = () => {
    const { t } = useSafeTranslation();
    const navigate = useNavigate();
    const { id: productId } = useParams();
    const page = usePageParam();
    const isNew = productId === '0';
    const formRef = useRef<FormHandleIF>(null);
    // The products list is read again after a delete (it said customers)
    const { promptDelete } = useDeleteItem([RESOURCE.PRODUCTS]);

    const { data: product, isLoading } = useQuery<ProductIF | null>({
        queryKey: [RESOURCE.PRODUCT, productId],
        queryFn: () => getSingle<ProductIF>({ id: Number(productId), type: RESOURCE.PRODUCT }),
        enabled: !isNew,
    });

    const title = isNew
        ? `${t('new')} ${t('products.singular')}`
        : `${t('products.singular')}${product ? ` - ${product.name}` : ''}`;
    const buttons = [
        {
            label: 'button.save',
            onClick: () => formRef.current?.submitSave(),
            dataTestId: 'save-product',
        },
        {
            label: 'button.goBack',
            onClick: () => navigate(`${PATHS.PRODUCTS}${page}/`),
            classname: 'secondary',
        },
        ...(product
            ? [
                  {
                      label: 'button.delete',
                      onClick: () =>
                          promptDelete({ id: product.id, resource: RESOURCE.PRODUCTS, page }),
                      classname: 'tertiary',
                      dataTestId: 'delete-product',
                  },
              ]
            : []),
    ];

    if (isLoading) return <Loader />;
    if (!isNew && !product) return <PageNotFound />;

    return (
        <>
            <Header title={title} buttons={buttons} />

            <section className="component product">
                <ProductForm
                    ref={formRef}
                    key={productId}
                    initialProduct={product ?? null}
                    isNew={isNew}
                    type={RESOURCE.PRODUCT}
                />
            </section>
        </>
    );
};

export default Product;
