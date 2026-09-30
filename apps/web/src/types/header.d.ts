export interface HeaderIF {
    updateKeyword?;
    keyword?: string;
}

interface ListButtonIF {
    label: string;
    classname?: string;
    onClick?: (event) => void;
    Element?: ComponentType;
    dropdown?: ReactNode;
    callback?: MouseEventHandler<HTMLButtonElement>;
    dataTestId?: string;
}
