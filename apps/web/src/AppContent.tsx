import { lazy, Suspense } from 'react';
import { useAuth } from './contexts/Auth';
import { Route, Routes, useMatch } from 'react-router';
import { PATHS } from './variables';

import Navigation from './components/_shared/Navigation/Navigation';
import PrivateRoute from './PrivateRoute';
import Loader from './components/_shared/Loader/Loader';
import BiggerError from './components/BiggerError/BiggerError';
import Confirmation from './components/_shared/Confirmation/Confirmation';
import Notification from './components/_shared/Notification/Notification';

const PageNotFound = lazy(() => import('./components/PageNotFound/PageNotFound'));
const Home = lazy(() => import('./components/Home/Home'));
const Login = lazy(() => import('./components/Login/Login'));
const Forgot = lazy(() => import('./components/Login/Forgot'));
const Customers = lazy(() => import('./components/Customers/Customers'));
const Customer = lazy(() => import('./components/Customer/Customer'));
const Products = lazy(() => import('./components/Products/Products'));
const Product = lazy(() => import('./components/Product/Product'));
const Profile = lazy(() => import('./components/Profile/Profile'));
const Worksheet = lazy(() => import('./components/Worksheet/Worksheet'));
const Worksheets = lazy(() => import('./components/Worksheets/Worksheets'));
const WorksheetsPerCustomer = lazy(() => import('./components/Worksheets/WorksheetsPerCustomer'));
const Invoice = lazy(() => import('./components/Invoice/Invoice'));
const Invoices = lazy(() => import('./components/Invoices/Invoices'));
const Settings = lazy(() => import('./components/Settings/Settings'));
const Pdf = lazy(() => import('./components/Pdf/Pdf'));
const Restore = lazy(() => import('./components/Login/Restore'));
const ChangeLog = lazy(() => import('./components/ChangeLog/ChangeLog'));
const Users = lazy(() => import('./components/Users/Users'));
const User = lazy(() => import('./components/User/User'));

const AppContent = () => {
    const { loading, errorMessage, isAuth } = useAuth();

    // pages with no menu elements
    const matchPdf = useMatch(`${PATHS.PDF}:hash/`);
    const matchLogin = useMatch(PATHS.LOGIN);
    const matchRestore = useMatch(`${PATHS.RESTORE}:hash/`);
    const matchForgot = useMatch(PATHS.FORGOT);
    const navigationPage = !(matchPdf || matchLogin || matchRestore || matchForgot);

    if (loading) {
        return <Loader />;
    }

    if (errorMessage) {
        return <BiggerError type={errorMessage} />;
    }

    return (
        <>
            {navigationPage && isAuth && <Navigation />}

            <Suspense fallback={<Loader />}>
                <Routes>
                    {/* Protected routes */}
                    <Route element={<PrivateRoute />}>
                        <Route path="/" element={<Home />} />
                        <Route path={PATHS.HOME} element={<Home />} />
                        <Route path={PATHS.CHANGELOG} element={<ChangeLog />} />

                        {/* Products */}
                        <Route path={PATHS.PRODUCTS} element={<Products />} />
                        <Route path={`${PATHS.PRODUCTS}:page/`} element={<Products />} />
                        <Route path={`${PATHS.PRODUCT}:page/:id/`} element={<Product />} />

                        {/* Customers */}
                        <Route path={PATHS.CUSTOMERS} element={<Customers />} />
                        <Route path={`${PATHS.CUSTOMERS}:page/`} element={<Customers />} />
                        <Route path={`${PATHS.CUSTOMER}:page/:id/`} element={<Customer />} />

                        {/* Worksheets */}
                        <Route path={PATHS.WORKSHEETS} element={<Worksheets />} />
                        <Route path={`${PATHS.WORKSHEETS}:page/`} element={<Worksheets />} />
                        <Route
                            path={`${PATHS.WORKSHEETS}:page/:customerId/:worksheetPage/`}
                            element={<WorksheetsPerCustomer />}
                        />
                        <Route path={`${PATHS.WORKSHEET}:id/`} element={<Worksheet />} />
                        <Route
                            path={`${PATHS.WORKSHEET}:page/:customerId/`}
                            element={<Worksheet />}
                        />
                        <Route
                            path={`${PATHS.WORKSHEET}:page/:customerId/:worksheetPage/:worksheetId`}
                            element={<Worksheet />}
                        />

                        {/* Invoices */}
                        <Route path={PATHS.INVOICES} element={<Invoices />} />
                        <Route path={`${PATHS.INVOICES}:page/`} element={<Invoices />} />
                        <Route path={`${PATHS.INVOICE}:page/:invoiceId/`} element={<Invoice />} />
                        <Route
                            path={`${PATHS.INVOICE}:page/:customerId/:invoicePage/:invoiceId/`}
                            element={<Invoice />}
                        />

                        {/* Profile & Settings */}
                        <Route path={PATHS.PROFILE} element={<Profile />} />
                        <Route path={PATHS.SETTINGS} element={<Settings />} />
                        <Route path={`${PATHS.SETTINGS}:type/`} element={<Settings />} />

                        {/* Users */}
                        <Route path={PATHS.USERS} element={<Users />} />
                        <Route path={`${PATHS.USERS}:page/`} element={<Users />} />
                        <Route path={`${PATHS.USER}:page/:id/`} element={<User />} />
                    </Route>

                    {/* Public routes */}
                    <Route path={`${PATHS.PDF}:hash/`} element={<Pdf />} />
                    <Route path={PATHS.LOGIN} element={<Login />} />
                    <Route path={PATHS.FORGOT} element={<Forgot />} />
                    <Route path={`${PATHS.RESTORE}:token/`} element={<Restore />} />
                    <Route path="*" element={<PageNotFound />} />
                </Routes>
            </Suspense>
            <Notification />
            <Confirmation />
        </>
    );
};

export default AppContent;
