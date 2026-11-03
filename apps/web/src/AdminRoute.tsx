import { Outlet } from 'react-router';
import { useAuth } from './contexts/Auth';
import PageNotFound from './components/PageNotFound/PageNotFound';

// Users and settings are admin-only in the API (it answers everyone else with 403). The pages are
// kept from other users here too, at the route, so no page of them mounts, asks for data or shows
// a form that cannot be saved; hiding the menu entry alone left them open by URL.
const AdminRoute = () => {
    const { user } = useAuth();

    return user?.role === 'admin' ? <Outlet /> : <PageNotFound />;
};

export default AdminRoute;
