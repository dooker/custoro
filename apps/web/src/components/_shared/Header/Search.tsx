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
// open with it, follows it on Back, Forward or a link, and closing the box clears it.
export const Search = ({ value, onChange }: HeaderSearchIF) => {
    const { t } = useSafeTranslation();
    const [showSearch, setShowSearch] = useState(!!value);
    const [draft, setDraft] = useState(value);
    // The address's word this box last saw, and the last word it sent itself: a new word in the
    // address that the box did not send came from Back, Forward or a link
    const [seen, setSeen] = useState(value);
    const [sent, setSent] = useState(value);
    // Counts the words that came from elsewhere; a word typed before one of them is dropped
    const [elsewhere, setElsewhere] = useState(0);

    if (value !== seen) {
        setSeen(value);

        if (value !== sent) {
            setDraft(value);
            setSent(value);
            setShowSearch(!!value);
            setElsewhere(elsewhere + 1);
        }
    }

    // Dropped when the search box is gone: a word typed just before opening a row must not move
    // the user back to the list they left. A word typed before the address changed elsewhere
    // (Back) is dropped too; the box's own earlier word arriving in the address is not a change
    // from elsewhere, so newer typing is still sent.
    const debouncedChange = useDebounce(
        (keyword: string, typedAt: number) => {
            if (typedAt !== elsewhere) {
                return;
            }

            setSent(keyword.trim());
            onChange(keyword.trim());
        },
        debounceTimer,
        { cancelOnUnmount: true }
    );

    const type = (next: string) => {
        setDraft(next);
        debouncedChange(next, elsewhere);
    };

    const toggle = () => {
        setDraft('');
        setShowSearch((previous) => !previous);
        setSent('');
        // Also drops a word still waiting in the debounce
        debouncedChange('', elsewhere);
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
