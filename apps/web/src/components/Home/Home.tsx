import Header from '../_shared/Header/Header';
import ListWidget from '../_shared/List/ListWidget';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import { useAuth } from '../../contexts/Auth';
import { customerColumns, customerHref } from '../Customers/Customers';
import { productColumns, productHref } from '../Products/Products';
import { invoiceColumns, invoiceHref } from '../Invoices/Invoices';
import { worksheetCustomerColumns, worksheetCustomerHref } from '../Worksheets/Worksheets';
import type { InvoiceWithCustomerIF, ProductIF, WorksheetIF } from '../../types';
import type { CustomerIF } from '../../types/customer';
import { PATHS, RESOURCE } from '../../variables';
import WorksheetIcon from '../_shared/Icons/Worksheet';
import InvoiceIcon from '../_shared/Icons/Invoice';
import ProductIcon from '../_shared/Icons/Product';
import CustomerIcon from '../_shared/Icons/Customer';
import styles from './Home.module.sass';

// The newest first; worksheets and invoices are listed newest first anyway
const newestFirst = { order: 'id', direction: 'DESC' };

// The dashboard: the latest of each list. It has its own title and no buttons: the small lists
// never change the header (they did, and the last one to load won).
const Home = () => {
    const { t } = useSafeTranslation();
    const { user } = useAuth();

    return (
        <>
            <Header title={t('home.dashboard')} />

            <div className={styles.dashboard}>
                <ListWidget<WorksheetIF>
                    resource={RESOURCE.WORKSHEETS}
                    path={PATHS.WORKSHEETS}
                    title="worksheets.plural"
                    href={`${PATHS.WORKSHEETS}1/`}
                    icon={WorksheetIcon}
                    columns={worksheetCustomerColumns}
                    rowHref={(row) => worksheetCustomerHref(row)}
                />
                <ListWidget<InvoiceWithCustomerIF>
                    resource={RESOURCE.INVOICES}
                    path={PATHS.INVOICES}
                    title="invoices.plural"
                    href={`${PATHS.INVOICES}1/`}
                    icon={InvoiceIcon}
                    columns={invoiceColumns()}
                    rowHref={(row) => invoiceHref(row)}
                />
                <ListWidget<ProductIF>
                    resource={RESOURCE.PRODUCTS}
                    path={PATHS.PRODUCTS}
                    title="products.plural"
                    href={`${PATHS.PRODUCTS}1/`}
                    icon={ProductIcon}
                    columns={productColumns(!!Number(user?.discount))}
                    rowHref={(row) => productHref(row)}
                    params={newestFirst}
                />
                <ListWidget<CustomerIF>
                    resource={RESOURCE.CUSTOMERS}
                    path={PATHS.CUSTOMERS}
                    title="customers.plural"
                    href={`${PATHS.CUSTOMERS}1/`}
                    icon={CustomerIcon}
                    columns={customerColumns}
                    rowHref={(row) => customerHref(row)}
                    params={newestFirst}
                />
            </div>
        </>
    );
};

export default Home;
