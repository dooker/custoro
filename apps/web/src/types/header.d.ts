import type { ReactNode } from 'react';

// A button in the page header
export interface HeaderButtonIF {
    // A text key
    label: string;
    // primary (default, green), secondary (blue), tertiary (red); "disabled" can be added
    classname?: string;
    onClick?: () => void;
    // Shown under the button, such as the "Add to invoice" choices
    dropdown?: ReactNode;
    dataTestId?: string;
}

// The search box in a list's header: the word in the URL and how to change it
export interface HeaderSearchIF {
    value: string;
    onChange: (keyword: string) => void;
}

export interface HeaderIF {
    title: string;
    buttons?: HeaderButtonIF[];
    search?: HeaderSearchIF;
}
