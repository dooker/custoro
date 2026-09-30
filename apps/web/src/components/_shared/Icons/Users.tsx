import { person } from '../../../variables';

const Users = () => {
    return (
        <svg viewBox="0 0 140 130" fill="currentColor">
            <g transform="translate(60,10) scale(0.70)">
                <path d={person} />
            </g>

            <g transform="translate(0,10) scale(0.85)">
                <path d={person} className="users-stroke" />

                <path d={person} fill="currentColor" />
            </g>
        </svg>
    );
};

export default Users;
