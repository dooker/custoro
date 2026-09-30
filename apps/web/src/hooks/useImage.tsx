import React, { lazy, Suspense, useState } from 'react';

const NoProfile = lazy(() => import('../components/fallbacks/NoProfile'));

interface UseImageIF {
    src: string | undefined | null;
    alt?: string;
}

export const useImage = ({ src, alt }: UseImageIF) => {
    const [hasError, setHasError] = useState(false);

    if (hasError || !src) {
        return (
            <Suspense fallback={<span>Loading fallback…</span>}>
                <NoProfile />
            </Suspense>
        );
    }

    return <img src={src} alt={alt} onError={() => setHasError(true)} />;
};
