import { useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { enGB } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { useOutsideAlerter } from '../../hooks/clickOutside';
import { formattedDate } from '../../shared/helpers';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import styles from './InvoiceDatePicker.module.sass';

interface DatePickerProps {
    invoiceDate: Date | string;
    onChange: (date: Date) => void;
    isLocked: boolean;
}

// dd.MM.yyyy, as shown in the input
const formatInputDate = (date: Date) =>
    `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;

const InvoiceDatePicker = ({ invoiceDate, onChange, isLocked }: DatePickerProps) => {
    const { t } = useSafeTranslation();
    const [showPicker, setShowPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Convert string date back to Date object if necessary
    const selectedDate = typeof invoiceDate === 'string' ? new Date(invoiceDate) : invoiceDate;

    useOutsideAlerter({
        ref: pickerRef,
        callback: () => setShowPicker(false),
    });

    const handleSelect = (date: Date) => {
        setShowPicker(false);
        onChange(formattedDate(date) as unknown as Date);
    };

    return (
        <div className="date">
            <label htmlFor="date-field">{t('invoices.form.invoice-date')}</label>
            <input
                id="date-field"
                value={formatInputDate(selectedDate)}
                className="date-input"
                readOnly
                onFocus={() => !isLocked && setShowPicker(true)}
            />

            {showPicker && !isLocked && (
                <div ref={pickerRef} className={styles.picker}>
                    <DayPicker
                        mode="single"
                        required
                        selected={selectedDate}
                        defaultMonth={selectedDate}
                        locale={enGB}
                        weekStartsOn={1}
                        onSelect={(date) => handleSelect(date)}
                    />
                </div>
            )}
        </div>
    );
};

export default InvoiceDatePicker;
