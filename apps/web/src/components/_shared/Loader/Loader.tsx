import Logo from '@images/background.svg?react';
import styles from './Loader.module.sass';

interface LoaderIF {
    additionalClass?: string;
}

const Loader = ({ additionalClass }: LoaderIF) => {
    return (
        <div className={`${styles.loader}${additionalClass ? ` ${additionalClass}` : ''}`}>
            <Logo />

            <div className={styles['lds-roller']}>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
            </div>
        </div>
    );
};

export default Loader;
