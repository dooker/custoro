import type { Request } from "express";

export interface ProductIF {
    id: number;
    code: string;
    name: string;
    price: number;
    discount_price: number;
    discountPrice: number;
    unit: string;
    comment: string;
    count?: number;
}

export interface GetSingleIF {
    req: Request;
    id?: number;
}

export interface GetMultipleIF {
    request: Request;
}

export interface PostPutPriceIF {
    price: number;
    discountPrice: number;
}
