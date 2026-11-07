import { useMemo, useState } from 'react';
import AsyncSelect from 'react-select/async';
import type { SingleValue } from 'react-select';
import type { SelectOptionIF } from '../../../types';
import { getSearch } from '../../../utils/Getters/getSearch';
import {
    debounceLatest,
    pickerDelayMs,
    pickerLimit,
    toPickerOption,
    type PickerOptionIF,
    type PickerResource,
} from '../../../utils/pickers';

interface SearchSelectIF<T> {
    resource: PickerResource;
    name: string;
    // The choice shown before the user picks one (an invoice's customer, a worksheet's product)
    value?: SelectOptionIF | null;
    onSelect: (option: PickerOptionIF<T> | null) => void;
    placeholder?: string;
    // Empty again after each choice, for a picker that adds things (a line on an invoice)
    clearOnSelect?: boolean;
}

// A picker that searches the customers or products in the API as the user types and shows the
// first page of matches (the first ones when nothing is typed yet)
const SearchSelect = <
    T extends { id?: number | string; name?: string | null; code?: string | null },
>({
    resource,
    name,
    value,
    onSelect,
    placeholder,
    clearOnSelect = false,
}: SearchSelectIF<T>) => {
    const [chosen, setChosen] = useState<SelectOptionIF | null>(null);
    const loadOptions = useMemo(
        () =>
            debounceLatest(async (keyword: string) => {
                const { resource: items = [] } = await getSearch<T>({
                    resource,
                    keyword,
                    page: 1,
                    limit: pickerLimit,
                });

                return items.map((item) => toPickerOption(resource, item));
            }, pickerDelayMs),
        [resource]
    );

    return (
        <AsyncSelect<PickerOptionIF<T>>
            className="select"
            classNamePrefix="select"
            name={name}
            inputId={name}
            cacheOptions
            defaultOptions
            loadOptions={loadOptions}
            value={clearOnSelect ? null : ((chosen ?? value ?? null) as PickerOptionIF<T> | null)}
            onChange={(option: SingleValue<PickerOptionIF<T>>) => {
                if (!clearOnSelect) {
                    setChosen(option);
                }

                onSelect(option);
            }}
            placeholder={placeholder}
        />
    );
};

export default SearchSelect;
