import { lazy, useEffect } from 'react';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Header from '../_shared/Header/Header';
import { useHeadlineHandler } from '../../hooks/useHeadline';
import styles from './Home.module.sass';

const Customers = lazy(() => import('../Customers/Customers'));
const Worksheets = lazy(() => import('../Worksheets/Worksheets'));
const Invoices = lazy(() => import('../Invoices/Invoices'));
const Products = lazy(() => import('../Products/Products'));

const Home = () => {
    const { t } = useSafeTranslation();
    const updateTitle = useHeadlineHandler();

    useEffect(() => {
        updateTitle({ title: t('home.dashboard') });
    }, [t, updateTitle]);

    return (
        <>
            <Header />

            <div className={styles.dashboard}>
                <Worksheets compact={true} />
                <Invoices compact={true} />
                <Products compact={true} />
                <Customers compact={true} />
            </div>
        </>
    );
};

export default Home;
