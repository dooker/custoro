export const isEmpty = (obj: object | null) => {
    if (obj === null) {
        return false;
    }

    for (const key in obj) {
        if (Object.hasOwn(obj, key)) {
            return false;
        }
    }

    return true;
};

export const formattedDate = (input: Date) => {
    const date = new Date(input);

    return `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

export const handleError = (error: string) => {
    console.error(`So this happened - ${error}`);
};

export const formatDateTime = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
    });
};

export const Formify = <T extends object>(data: T): FormData => {
    const formData = new FormData();

    for (const [key, value] of Object.entries(data)) {
        // value is unknown here — we narrow it
        if (value === undefined || value === null) continue;

        if (value instanceof File || value instanceof Blob) {
            formData.append(key, value);
        } else if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            formData.append(key, String(value));
        } else {
            // If someone passes an object/array/function → throw
            throw new Error(`Invalid FormData value for key "${key}"`);
        }
    }

    return formData;
};
