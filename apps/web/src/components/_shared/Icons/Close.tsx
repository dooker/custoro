import styles from './Close.module.sass';

interface CloseIF {
    callback: () => void;
}

const Close = ({ callback }: CloseIF) => {
    return (
        <svg viewBox="0 0 24 24" className={styles.close} onClick={callback}>
            <path
                d="M5 5L19 19M5 19L19 5"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

export default Close;
