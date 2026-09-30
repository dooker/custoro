import { useState } from 'react';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useDebounce } from '../../../hooks/useDebounce';
import { debounceTimer } from '../../../variables';
import styles from './Search.module.sass';

import { Search as SearchIcon } from '../Icons/Search';
import Button from '../Form/Button';
import Close from '../Icons/Close';

interface SearchIF {
    updateKeyword: (keyword: string) => void;
}

export const Search = ({ updateKeyword }: SearchIF) => {
    const { t } = useSafeTranslation();
    const [showSearch, setShowSearch] = useState(false);
    const [draft, setDraft] = useState<string>('');

    const handleEscape = (key: string) => {
        if (key !== 'Escape') {
            return;
        }

        handleSearchInput();
    };

    const debouncedAutoSave = useDebounce((data: string) => {
        updateKeyword(data);
    }, debounceTimer);

    const onChange = (value: string) => {
        setDraft(value);
        debouncedAutoSave(value);
    };

    const handleSearchInput = () => {
        setDraft('');
        setShowSearch((prev) => !prev);

        updateKeyword('');
    };

    return (
        <div className={styles.searchWrapper}>
            {showSearch && (
                <>
                    <input
                        autoFocus
                        placeholder={t('search')}
                        className={styles.search}
                        value={draft}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyUp={(e) => handleEscape(e.key)}
                        data-testid="search-input"
                    />
                    <Close callback={() => handleSearchInput()}></Close>
                </>
            )}

            <Button
                additionalClassName={`large primary`}
                onClick={() => handleSearchInput()}
                Element={SearchIcon}
                dataTestId="search-product"
            />
        </div>
    );
};
