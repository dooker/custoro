import Field from '../../_shared/Form/Field';
import React from 'react';
import type { SettingsViewIF } from '../SettingsForm';

const Server = ({ settings, onChange }: SettingsViewIF) => {
    return (
        <>
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
            </div>
        </>
    );
};

export default Server;
