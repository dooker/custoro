// What the settings page sends: the settings that differ from what the API last had, not the whole
// form. The form is filled when the page opens, so a whole-form save would write every old value
// back, including the invoice counter that other users move while the page is open (the API then
// refuses the counter and with it the whole save, see lastInvoiceIdTooLow).
//
// The logo is a file with its own delete route: only a newly picked file is sent, never the name
// of the stored one or null.
export const changedSettings = <T extends object>(saved: T, draft: T): Partial<T> => {
    const changes: Partial<T> = {};

    for (const key of Object.keys(draft) as (keyof T)[]) {
        const value = draft[key];

        if (key === 'logo' && !(value instanceof File)) {
            continue;
        }

        if (!Object.is(saved[key], value)) {
            changes[key] = value;
        }
    }

    return changes;
};
