import { useParams } from 'react-router';
import { pageFromParam } from '../components/_shared/List/listLogic';

/**
 * A page number from the address (/customer/3/7/ is page 3 of the customer list), read the same
 * way everywhere: a whole number from 1, anything else (abc, 0, -2, 2.5, missing) is page 1.
 */
export const usePageParam = (name: string = 'page'): number => pageFromParam(useParams()[name]);
