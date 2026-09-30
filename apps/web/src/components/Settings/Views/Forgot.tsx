import Field from '../../_shared/Form/Field';
import React from 'react';
import type { SettingsViewIF } from '../SettingsForm';
import HelpField from '../../HelpField/Helpfield';

const Forgot = ({ settings, onChange }: SettingsViewIF) => {
    return (
        <>
            <HelpField text="settings.help.forgotHelp"></HelpField>

            <Field
                parent="settings"
                name="forgotSubject"
                value={settings.forgotSubject}
                onChange={onChange}
            />

            <Field
                parent="settings"
                name="forgotText"
                value={settings.forgotText}
                onChange={onChange}
                type="textarea"
            />

            <Field
                parent="settings"
                name="forgotHtml"
                value={settings.forgotHtml}
                onChange={onChange}
                type="rte"
            />
        </>
    );
};

export default Forgot;
