import { lazy, Suspense } from 'react';
import { formatDateTime } from '../../shared/helpers';
import { useAuth } from '../../contexts/Auth';
import type { InvoiceIF, EntityOnChangeIF } from '../../types';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import Field from '../_shared/Form/Field';
import HelpField from '../HelpField/Helpfield';
import type { CustomerIF } from '../../types/customer';
import { toPickerOption } from '../../utils/pickers';
import styles from './Details.module.sass';

const Toggle = lazy(() => import('../_shared/Form/Toggle'));
const InvoiceDatePicker = lazy(() => import('./InvoiceDatePicker'));

interface DetailsIF {
    draft: InvoiceIF | null;
    onChange: (params: EntityOnChangeIF) => void;
    // The invoice's customer as it is now (an open invoice's), for the picker
    customer?: CustomerIF | null;
    // Who a paid invoice is billed to: its copy of the customer (utils/billedCustomer.ts)
    receiverName?: string | null;
    noVat: boolean;
}

const paymentTypes = ['transfer', 'cash'];
const invoiceTypes = ['invoice', 'offer'];

const Details = ({ draft, onChange, customer, receiverName, noVat }: DetailsIF) => {
    const { t } = useSafeTranslation();
    const { user } = useAuth();
    const { offer } = user || {};
    const {
        locked,
        customerId,
        invoiceDate: rawInvoiceDate,
        createDate,
        changeDate,
        paymentType,
        invoiceType,
    } = draft || {};
    const invoiceDate = rawInvoiceDate || new Date();
    const isLocked = locked === 1;
    const selectedCustomer =
        customer && Number(customer.id) === Number(customerId)
            ? toPickerOption('customers', customer)
            : null;

    const renderInvoiceDate = () => {
        return (
            <div className="date-wrapper">
                {isLocked ? (
                    <div className="date">
                        <span className="label">{t('invoices.form.invoice-date')}</span>
                        {`: ${formatDateTime(invoiceDate)}`}
                    </div>
                ) : (
                    <Suspense fallback={<input className="date-input" readOnly />}>
                        <InvoiceDatePicker
                            invoiceDate={invoiceDate}
                            onChange={(value) => onChange({ name: 'invoiceDate', value })}
                            isLocked={isLocked || false}
                        />
                    </Suspense>
                )}
            </div>
        );
    };

    const paymentToggle = {
        items: paymentTypes,
        initial: String(paymentType),
        onChange: (value: string) => onChange({ name: 'paymentType', value }),
    };
    const invoiceToggle = {
        items: invoiceTypes,
        initial: String(invoiceType),
        onChange: (value: string) => onChange({ name: 'invoiceType', value }),
    };

    return (
        <div className={`${styles.details} general-form`}>
            <div>
                {isLocked ? (
                    <>
                        <span className="label">{t('invoices.form.invoice-receiver')}</span>
                        {`: ${receiverName || 'Unknown Customer'}`}
                    </>
                ) : (
                    <Suspense fallback={<div className="select-loader" />}>
                        <Field
                            type="select"
                            parent="invoices"
                            name="customer"
                            select={{ search: 'customers', initial: selectedCustomer }}
                            onChange={(customer) =>
                                onChange({ name: 'customerId', value: Number(customer.value) })
                            }
                            placeholder={t('customers.form.placeholder')}
                        />
                    </Suspense>
                )}
            </div>

            {noVat && <HelpField text="invoices.form.vatNumber" position="top" />}

            <div className={styles.split}>
                <div>
                    <span className="label">{t('invoices.form.create-date')}</span>:{' '}
                    {formatDateTime(createDate || new Date())}
                </div>

                <div>
                    <span className="label">{t('invoices.form.change-date')}</span>:{' '}
                    {formatDateTime(changeDate || new Date())}
                </div>

                {isLocked && renderInvoiceDate()}
            </div>

            {!isLocked && renderInvoiceDate()}

            <div className={offer ? styles.split : styles.half}>
                <div>
                    <label>{t('invoices.form.payment')}</label>
                    {isLocked ? (
                        `: ${paymentType}`
                    ) : (
                        <Toggle
                            toggle={paymentToggle}
                            parent="invoices"
                            name="paymentType"
                        ></Toggle>
                    )}
                </div>

                {offer ? (
                    <div>
                        <label>{t('invoices.form.type')}</label>
                        {isLocked ? (
                            `: ${invoiceType}`
                        ) : (
                            <Toggle
                                toggle={invoiceToggle}
                                parent="invoices"
                                name="invoiceType"
                            ></Toggle>
                        )}
                    </div>
                ) : (
                    ''
                )}
            </div>
        </div>
    );
};

export default Details;
