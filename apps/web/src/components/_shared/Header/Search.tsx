import { useState } from 'react';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useDebounce } from '../../../hooks/useDebounce';
import { debounceTimer } from '../../../variables';
import type { HeaderSearchIF } from '../../../types/header';
import styles from './Search.module.sass';

import { Search as SearchIcon } from '../Icons/Search';
import Button from '../Form/Button';
import Close from '../Icons/Close';

// The search box of a list. The word itself lives in the URL (useListParams): the box starts
// open with it, and closing the box clears it.
export const Search = ({ value, onChange }: HeaderSearchIF) => {
    const { t } = useSafeTranslation();
    const [showSearch, setShowSearch] = useState(!!value);
    const [draft, setDraft] = useState(value);

    // Dropped when the search box is gone: a word typed just before opening a row must not move
    // the user back to the list they left
    const debouncedChange = useDebounce(
        (keyword: string) => {
            onChange(keyword.trim());
        },
        debounceTimer,
        { cancelOnUnmount: true }
    );

    const type = (next: string) => {
        setDraft(next);
        debouncedChange(next);
    };

    const toggle = () => {
        setDraft('');
        setShowSearch((previous) => !previous);
        // Also drops a word still waiting in the debounce
        debouncedChange('');
        onChange('');
    };

    return (
        <div className={styles.searchWrapper}>
            {showSearch && (
                <>
                    <input
                        autoFocus
                        type="search"
                        aria-label={t('button.search')}
                        placeholder={t('search')}
                        className={styles.search}
                        value={draft}
                        onChange={(event) => type(event.target.value)}
                        onKeyUp={(event) => event.key === 'Escape' && toggle()}
                        data-testid="search-input"
                    />
                    <Close callback={toggle}></Close>
                </>
            )}

            <Button
                additionalClassName="large primary"
                onClick={toggle}
                Element={SearchIcon}
                dataTestId="search-button"
            />
        </div>
    );
};
