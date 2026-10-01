import { useRef, useState } from 'react';
import { DayPicker, useInput } from 'react-day-picker';
import enGB from 'date-fns/locale/en-GB'; // Direct path import for size
import { useOutsideAlerter } from '../../hooks/clickOutside';
import { formattedDate } from '../../shared/helpers';
import 'react-day-picker/dist/style.css';
import { useSafeTranslation } from '../../hooks/useSafeTranslation';
import styles from './InvoiceDatePicker.module.sass';

interface DatePickerProps {
    invoiceDate: Date | string;
    onChange: (date: Date) => void;
    isLocked: boolean;
}

const InvoiceDatePicker = ({ invoiceDate, onChange, isLocked }: DatePickerProps) => {
    const { t } = useSafeTranslation();
    const [showPicker, setShowPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Convert string date back to Date object if necessary
    const selectedDate = typeof invoiceDate === 'string' ? new Date(invoiceDate) : invoiceDate;

    const { inputProps, dayPickerProps } = useInput({
        defaultSelected: selectedDate,
        format: 'dd.MM.yyyy',
        required: true,
    });

    useOutsideAlerter({
        ref: pickerRef,
        callback: () => setShowPicker(false),
    });

    const handleSelect = (date: Date | undefined) => {
        setShowPicker(false);

        if (date) {
            onChange(formattedDate(date) as unknown as Date);
        }
    };

    return (
        <div className="date">
            <label htmlFor="date-field">{t('invoices.form.invoice-date')}</label>
            <input
                id="date-field"
                {...inputProps}
                className="date-input"
                readOnly
                onFocus={() => !isLocked && setShowPicker(true)}
            />

            {showPicker && !isLocked && (
                <div ref={pickerRef} className={styles.picker}>
                    <DayPicker
                        mode="single"
                        selected={selectedDate}
                        locale={enGB}
                        weekStartsOn={1}
                        onSelect={(date) => handleSelect(date)}
                        {...dayPickerProps}
                    />
                </div>
            )}
        </div>
    );
};

export default InvoiceDatePicker;
