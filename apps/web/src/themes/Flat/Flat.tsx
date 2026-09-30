import React, { useEffect } from 'react';
import { ReactComponent as Logo } from '../../assets/images/background.svg';

const Flat = () => {
    useEffect(() => {
        document.getElementById('root')?.classList.add('flat');
    }, []);

    return <Logo />;
};

export default Flat;
