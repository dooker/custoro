export interface UserIF {
    id: number;
    name: string;
    username: string;
    role: string;
    avatar?: string;
    discount: string;
    offer: string;
}

export interface UserFormIF {
    initialUser: UserIF | null;
    isNew: boolean;
    type: string;
}

export interface UserAvatarIF {
    src: string | null;
    alt: string;
}
