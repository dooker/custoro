import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { cellText, rowClass, tableClass, type ColumnIF } from './listLogic';
import '@css/shared/GeneralTable.sass';

export type { ColumnIF };

export interface ListTableIF<T> {
    columns: ColumnIF<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    // Where a row leads; a row without one is not a link
    rowHref?: (row: T) => string | undefined;
    rowClassName?: (row: T) => string;
    // A last cell with the row's own controls (delete, a checkbox), outside the link
    actions?: (row: T) => ReactNode;
    actionsHead?: ReactNode;
    className?: string;
    compact?: boolean;
}

/**
 * The table every list shows. A row that leads somewhere is a link in each cell, so the whole
 * row can be clicked, opened in a new tab and reached with the keyboard (one tab stop per row).
 */
const ListTable = <T,>({
    columns,
    rows,
    rowKey,
    rowHref,
    rowClassName,
    actions,
    actionsHead,
    className,
    compact,
}: ListTableIF<T>) => {
    const { t } = useSafeTranslation();
    return (
        <table className={tableClass(className, compact)}>
            <thead>
                <tr>
                    {columns.map(({ key, label, className: cellClass }) => (
                        <th key={key} className={cellClass}>
                            {label ? t(label) : ''}
                        </th>
                    ))}
                    {actions && <th className="actions">{actionsHead}</th>}
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => {
                    const href = rowHref?.(row);

                    return (
                        <tr key={rowKey(row)} className={rowClass(rowClassName?.(row))}>
                            {columns.map(({ key, className: cellClass, render }, index) => {
                                const content = render ? render(row) : cellText(row, key);

                                return href ? (
                                    <td key={key} className={[cellClass, 'link'].join(' ')}>
                                        <Link to={href} tabIndex={index === 0 ? 0 : -1}>
                                            {content}
                                        </Link>
                                    </td>
                                ) : (
                                    <td key={key} className={cellClass}>
                                        {content}
                                    </td>
                                );
                            })}
                            {actions && <td className="actions">{actions(row)}</td>}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

export default ListTable;
