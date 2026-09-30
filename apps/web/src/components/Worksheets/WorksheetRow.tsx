import { Link } from 'react-router-dom';
import { PATHS } from '../../variables';
import DeleteIcon from '../../assets/images/x.svg?react';
import { InvoiceIF, WorksheetIF } from '../../types';
import styles from './WorksheetRow.module.sass';

interface RowProps {
    item: WorksheetIF;
    isSelected: boolean;
    onToggle: (id: number) => void;
    onView: (id: number) => void;
    onDelete: (id: number) => void;
    customerInvoices: InvoiceIF[] | null;
    hasDiscount: boolean | undefined;
    compact?: boolean;
}

const WorksheetRow = ({
    item,
    isSelected,
    onToggle,
    onView,
    onDelete,
    customerInvoices,
    hasDiscount,
    compact,
}: RowProps) => {
    const { id, code, name, price, discountPrice, quantity, invoice } = item;

    // Find the invoice number if it exists
    const invoiceNumber = customerInvoices?.find((i) => i.id === invoice)?.number;

    return (
        <tr className={`${styles.row} row${invoice ? ' disabled' : ''}`}>
            <td className="id">{code}</td>
            <td onClick={() => !invoice && onView(id)} className="name">
                <span>{name}</span>
            </td>
            <td className="items">{Number(price).toFixed(2)}</td>
            {hasDiscount && !compact && (
                <td className="items">{Number(discountPrice).toFixed(2)}</td>
            )}
            <td className="items">{quantity}</td>
            {!compact && (
                <td className={`actions ${styles.actions}`}>
                    {invoice ? (
                        invoiceNumber ? (
                            <Link to={`${PATHS.INVOICE}1/${invoice}/`}>
                                {invoiceNumber || 'View'}
                            </Link>
                        ) : null
                    ) : (
                        <input type="checkbox" checked={isSelected} onChange={() => onToggle(id)} />
                    )}
                    <DeleteIcon onClick={() => onDelete(id)} />
                </td>
            )}
        </tr>
    );
};

export default WorksheetRow;
