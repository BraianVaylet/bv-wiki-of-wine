import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PublicOnlyRoute } from './auth/PublicOnlyRoute';
import { PageLoader } from './components/ui';
import { Login } from './pages/Login';
import { Wines } from './pages/Wines';

// Code splitting por ruta: catálogo y login en el bundle inicial; el resto on-demand.
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const Recover = lazy(() => import('./pages/Recover').then((m) => ({ default: m.Recover })));
const NewWine = lazy(() => import('./pages/NewWine').then((m) => ({ default: m.NewWine })));
const EditWine = lazy(() => import('./pages/EditWine').then((m) => ({ default: m.EditWine })));
const WineDetail = lazy(() =>
  import('./pages/WineDetail').then((m) => ({ default: m.WineDetail })),
);
const MyReviews = lazy(() => import('./pages/MyReviews').then((m) => ({ default: m.MyReviews })));

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/recover" element={<Recover />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Wines />} />
          <Route path="/wines/new" element={<NewWine />} />
          <Route path="/wines/:id" element={<WineDetail />} />
          <Route path="/wines/:id/edit" element={<EditWine />} />
          <Route path="/me/reviews" element={<MyReviews />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
