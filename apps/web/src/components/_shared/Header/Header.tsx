import { ConditionalWrapper } from '../../../utils/_helpers';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { Search } from './Search';
import Button from '../Form/Button';
import type { HeaderButtonIF, HeaderIF } from '../../../types/header';
import styles from './Header.module.sass';

/**
 * The page's title and buttons. Every page renders its own, so nothing else on the screen (the
 * small lists on Home, a list inside a form) can change them.
 */
const Header = ({ title, buttons = [], search }: HeaderIF) => {
    const { t } = useSafeTranslation();

    const renderButton = (
        { label, classname, onClick, dropdown, dataTestId }: HeaderButtonIF,
        index: number
    ) => (
        <ConditionalWrapper
            condition={!!dropdown}
            wrapper={(children) => <div className={styles.wrapper}>{children}</div>}
            key={index}
        >
            <Button
                additionalClassName={`large ${classname || 'primary'}`}
                text={t(label)}
                onClick={onClick}
                {...(dataTestId ? { dataTestId } : {})}
            />

            {dropdown}
        </ConditionalWrapper>
    );

    return (
        <header className="flex justify-between items-center px-6 bg-midnightBlue sticky top-0 z-20">
            <h1 className="text-2xl text-logo no-underline">{title}</h1>

            {(search || buttons.length > 0) && (
                <div className="flex gap-12 flex-wrap flex-[1_0_auto] justify-end">
                    {search && <Search value={search.value} onChange={search.onChange} />}
                    {buttons.map(renderButton)}
                </div>
            )}
        </header>
    );
};

export default Header;
