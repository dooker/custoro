import { useAuth } from './contexts/Auth';
import { Navigate, Outlet } from 'react-router';
import { PATHS } from './variables';
import Loader from './components/_shared/Loader/Loader';

const PrivateRoute = () => {
    const { isAuth, loading } = useAuth();

    if (loading) {
        return <Loader />;
    }

    return isAuth ? <Outlet /> : <Navigate to={PATHS.LOGIN} replace />;
};

export default PrivateRoute;
