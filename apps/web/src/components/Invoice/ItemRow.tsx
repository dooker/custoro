import { RESOURCE } from '../../variables';
import type { EntityOnChangeIF, InvoiceProductIF } from '../../types';
import DeleteIcon from '../../assets/images/x.svg?react';
import { useAuth } from '../../contexts/Auth';
import { useDeleteItem } from '../../hooks/useDeleteItem';
import { useParams } from 'react-router-dom';

interface ItemRowIF {
    item: InvoiceProductIF;
    index: number;
    onChange: ({ name, value }: EntityOnChangeIF) => void;
    invoiceIsLocked: boolean;
}

export const ItemRow = ({ item, index, onChange, invoiceIsLocked }: ItemRowIF) => {
    const { id, name, price, discountPrice, quantity = 0, unit } = item;
    const { user } = useAuth();
    const { discount } = user || {};
    const { page, invoiceId } = useParams();
    const { promptDelete } = useDeleteItem([RESOURCE.INVOICE, String(invoiceId)]);

    return (
        <tr className="row" key={index}>
            <td className="nr">{index + 1}</td>
            <td className="name general-form">{name}</td>
            <td className="items">{unit}</td>
            <td className="items general-form">
                <div className="field">
                    {invoiceIsLocked ? (
                        quantity
                    ) : (
                        <input
                            name="quantity"
                            type="number"
                            defaultValue={quantity}
                            onChange={(event) =>
                                onChange({
                                    name: String(id),
                                    value: event.target.value,
                                })
                            }
                        />
                    )}
                </div>
            </td>

            <td className="items">{Number(price).toFixed(2)}</td>

            {discount ? <td className="items">{Number(discountPrice).toFixed(2)}</td> : ''}

            <td className="items">{Number(price * quantity).toFixed(2)}</td>

            {discount ? (
                <td className="items">{Number(discountPrice * quantity).toFixed(2)}</td>
            ) : (
                ''
            )}

            {!invoiceIsLocked && (
                <td className="actions">
                    <DeleteIcon
                        onClick={() =>
                            promptDelete({
                                id,
                                page: Number(page),
                                resource: RESOURCE.INVOICE,
                            })
                        }
                    />
                </td>
            )}
        </tr>
    );
};
