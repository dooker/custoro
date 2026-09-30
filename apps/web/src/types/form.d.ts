export interface ToggleIF {
    items: string[];
    onChange: (item: string) => void;
    initial: string;
}

export interface SelectIF {
    options: SelectOptionIF[];
    initial: SelectOptionIF;
}

// TODO partly duplicates, should merge
export interface FieldIF {
    parent: string;
    name: string;
    value?: FieldValue;
    onChange?: ({ name, value }: EntityOnChangeIF) => void;
    type?: string;
    placeholder?: string;
    callback?: () => void;
    callbackParam?: number;
    error?: string | null;
    resource?: string;
    toggle?: ToggleIF;
    select?: SelectIF;
    invalidators?: string[][];
}

export interface InputFieldsIF {
    name: string;
    type?: string;
    toggle?: ToggleIF;
    select?: SelectIF;
    onChange?: ({ name, value }: EntityOnChangeIF) => void;
    resource?: string;
    callbackParam?: number;
    invalidators?: string[][];
}
