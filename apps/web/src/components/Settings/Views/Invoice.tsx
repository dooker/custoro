import Field from '../../_shared/Form/Field';
import type { SettingsViewIF } from '../SettingsForm';
import HelpField from '../../HelpField/Helpfield';

const Invoice = ({ settings, onChange }: SettingsViewIF) => {
    return (
        <>
            <HelpField text="settings.help.invoiceHelp"></HelpField>

            <Field
                parent="settings"
                name="invoiceSubject"
                value={settings.invoiceSubject}
                onChange={onChange}
            />

            <Field
                parent="settings"
                name="invoiceText"
                value={settings.invoiceText}
                onChange={onChange}
                type="textarea"
            />

            <Field
                parent="settings"
                name="invoiceHtml"
                value={settings.invoiceHtml}
                onChange={onChange}
                type="rte"
            />
        </>
    );
};

export default Invoice;
