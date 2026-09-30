import Field from '../../_shared/Form/Field';
import React from 'react';
import type { SettingsViewIF } from '../SettingsForm';

const General = ({ settings, onChange }: SettingsViewIF) => {
    return (
        <>
            <div className="splitter">
                <Field parent="settings" name="vat" value={settings.vat} onChange={onChange} />

                <Field
                    parent="settings"
                    name="lastInvoiceId"
                    value={settings.lastInvoiceId}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="invoiceFilenamePrefix"
                    value={settings.invoiceFilenamePrefix}
                    onChange={onChange}
                />
            </div>
        </>
    );
};

export default General;
