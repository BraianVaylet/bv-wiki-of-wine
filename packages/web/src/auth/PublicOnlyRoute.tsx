import { Navigate, Outlet } from 'react-router-dom';
import { PageLoader } from '../components/ui';
import { useSession } from './useAuth';

/** Login/registro/recuperación: si ya hay sesión, no tienen sentido. */
export function PublicOnlyRoute() {
  const { data: user, isPending } = useSession();

  if (isPending) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
