import { Navigate } from 'react-router-dom';
import { useMe } from '../api/queries';
import { Card, LoadingState, PageHeader } from '../components/ui';

export function BankingRoute({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me.isPending) return <LoadingState />;
  if (!me.data?.bankingAccess) return <Navigate to="/" replace />;
  if (!me.data.bankingEnabled) return <>
    <PageHeader eyebrow="Open banking" title="Banking" description="Banking access is reserved for this account." />
    <Card><p className="text-sm text-muted">Banking connections and synchronization are disabled in this environment.</p></Card>
  </>;
  return children;
}
