import CreatableSelect from 'react-select/creatable';
import type { SelectOptionIF } from '../../../types';
import type { SingleValue } from 'react-select';
import type { FieldIF } from '../../../types/form';

const Select = ({ name, onChange, select, placeholder }: FieldIF) => {
    const { options, initial } = select || {};

    return (
        <CreatableSelect<SelectOptionIF>
            className="select"
            classNamePrefix="select"
            value={initial as SelectOptionIF | null}
            name={name}
            id={name}
            options={options}
            isValidNewOption={() => false}
            onChange={(newValue: SingleValue<SelectOptionIF>) => {
                if (onChange && newValue) {
                    onChange({
                        name,
                        value: newValue.value,
                    });
                } else if (onChange && !newValue) {
                    // Handle "isClearable" case: if newValue is null, set value to empty string
                    onChange({ name, value: '' });
                }
            }}
            placeholder={placeholder}
            // isClearable={true}
        />
    );
};

export default Select;
