import type { FieldIF } from '../../../types/form';

const Textarea = ({ name, value, onChange, placeholder }: FieldIF) => {
    return (
        <textarea
            name={name}
            id={name}
            defaultValue={value as string}
            onChange={(e) => (onChange ? onChange({ name, value: e.target.value }) : null)}
            placeholder={placeholder}
        />
    );
};

export default Textarea;
