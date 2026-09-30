import Field from '../../_shared/Form/Field';
import type { SettingsViewIF } from '../SettingsForm';
import { RESOURCE } from '../../../variables';
import style from './Pdf.module.sass';

const Pdf = ({ settings, onChange }: SettingsViewIF) => {
    return (
        <>
            <div className={`splitter ${style.splitter}`}>
                <Field
                    parent="settings"
                    name="logo"
                    value={settings.logo as string}
                    onChange={onChange}
                    type="image"
                    callback={() => onChange({ name: 'logo', value: null })}
                    resource={RESOURCE.SETTINGS}
                />

                <Field
                    parent="settings"
                    name="pdfDisclaimer"
                    value={settings.pdfDisclaimer}
                    onChange={onChange}
                    type="textarea"
                />
            </div>

            <div className="splitter">
                <Field
                    parent="settings"
                    name="companyName"
                    value={settings.companyName}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyEmail"
                    value={settings.companyEmail}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyPhone"
                    value={settings.companyPhone}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyAddress1"
                    value={settings.companyAddress1}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyWebsite"
                    value={settings.companyWebsite}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyRegNr"
                    value={settings.companyRegNr}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyAddress2"
                    value={settings.companyAddress2}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyVatNumber"
                    value={settings.companyVatNumber}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyBankAccount"
                    value={settings.companyBankAccount}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="companyBankAccount2"
                    value={settings.companyBankAccount2}
                    onChange={onChange}
                />
            </div>
        </>
    );
};

export default Pdf;
