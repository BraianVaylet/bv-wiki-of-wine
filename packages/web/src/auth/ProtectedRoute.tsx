import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageLoader } from '../components/ui';
import { useSession } from './useAuth';

/** Rutas que exigen sesión. Sin ella, al login (recordando a dónde iba). */
export function ProtectedRoute() {
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
