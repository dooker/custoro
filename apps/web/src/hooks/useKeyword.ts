import { useState } from 'react';

export const useKeyword = () => {
    const [keyword, setKeyword] = useState('');

    const updateKeyword = (newKeyword: string) => {
        setKeyword(newKeyword);
    };

    return {
        keyword,
        updateKeyword,
    };
};
