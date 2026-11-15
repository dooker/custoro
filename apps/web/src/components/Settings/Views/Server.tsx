import Field from '../../_shared/Form/Field';
import HelpField from '../../HelpField/Helpfield';
import React from 'react';
import type { SettingsViewIF } from '../SettingsForm';

// The company's own mail server. The password is never shown: the API only says whether one is
// saved, and an empty field keeps it.
const Server = ({ settings, onChange }: SettingsViewIF) => {
    return (
        <>
            <HelpField
                text={
                    settings.mailUsesDefault
                        ? 'settings.help.mailDefault'
                        : settings.mailPasswordSaved
                          ? 'settings.help.mailPasswordSaved'
                          : 'settings.help.mailOwn'
                }
            ></HelpField>
            <div className="splitter">
                <Field parent="settings" name="host" value={settings.host} onChange={onChange} />

                <Field parent="settings" name="port" value={settings.port} onChange={onChange} />

                <Field
                    parent="settings"
                    name="username"
                    value={settings.username}
                    onChange={onChange}
                />

                <Field
                    parent="settings"
                    name="password"
                    value={settings.password}
                    onChange={onChange}
                    type="password"
                />

                <Field parent="settings" name="from" value={settings.from} onChange={onChange} />
            </div>
        </>
    );
};

export default Server;
