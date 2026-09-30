import { ConditionalWrapper } from '../../../utils/_helpers';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import { useHeadline } from '../../../store/headline';
import { Search } from './Search';
import Button from '../Form/Button';
import { useButtons } from '../../../store/buttons';
import type { HeaderIF, ListButtonIF } from '../../../types/header';
import styles from './Header.module.sass';

const Header = (props: HeaderIF) => {
    const { updateKeyword } = props;
    const { t } = useSafeTranslation();
    const headline = useHeadline((state) => state.title);
    const buttons = useButtons((state) => state.buttons);

    const renderButton = (
        { label, classname, onClick, dropdown, dataTestId }: ListButtonIF,
        index: number
    ) => {
        return (
            <ConditionalWrapper
                condition={!!dropdown}
                wrapper={(children) => <div className={styles.wrapper}>{children}</div>}
                key={index}
            >
                <Button
                    additionalClassName={`large ${classname || 'primary'}`}
                    text={t(label)}
                    onClick={onClick}
                    {...(dataTestId ? { dataTestId: dataTestId } : {})}
                />

                {dropdown && dropdown}
            </ConditionalWrapper>
        );
    };

    return (
        <header className="flex justify-between items-center px-6 bg-midnightBlue sticky top-0 z-20">
            <h1 className="text-2xl text-logo no-underline">{headline}</h1>

            {buttons && (
                <div className="flex gap-12 flex-wrap flex-[1_0_auto] justify-end">
                    {buttons.map((item: ListButtonIF, index: number) =>
                        item.label.includes('search') ? (
                            <Search updateKeyword={updateKeyword} key={index} />
                        ) : (
                            renderButton(item, index)
                        )
                    )}
                </div>
            )}
        </header>
    );
};

export default Header;
