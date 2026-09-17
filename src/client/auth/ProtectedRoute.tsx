import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../api/queries';
import { LoadingState } from '../components/ui';
export function ProtectedRoute({ children }: { children: React.ReactNode }) { const me = useMe(); const location = useLocation(); if (me.isPending) return <LoadingState />; if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />; return children; }
