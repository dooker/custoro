import React, { useEffect } from 'react';
import './Colors.sass';

const Colors = () => {
    useEffect(() => {
        document.getElementById('root')?.classList.add('colors');
    }, []);

    return <></>;
};

export default Colors;
