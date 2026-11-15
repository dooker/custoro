import { Outlet } from 'react-router';
import { useAuth } from './contexts/Auth';
import PageNotFound from './components/PageNotFound/PageNotFound';

// The companies page is the owner's only (the API answers everyone else with 403). As with the
// admin pages, the route itself is kept from everyone else, not only the menu entry.
const OwnerRoute = () => {
    const { user } = useAuth();

    return Number(user?.owner) === 1 ? <Outlet /> : <PageNotFound />;
};

export default OwnerRoute;
