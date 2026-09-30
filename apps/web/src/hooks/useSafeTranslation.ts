import { useTranslation } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';

type SafeT = <T extends string>(key: T, options?: Record<string, unknown>) => string;

interface SafeTranslationHook {
    t: SafeT;
    i18n: I18nInstance;
}

export const useSafeTranslation = (): SafeTranslationHook => {
    const { t, i18n } = useTranslation();

    return {
        t: t as unknown as SafeT,
        i18n,
    };
};
