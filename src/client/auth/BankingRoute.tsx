import { Link, Navigate } from 'react-router-dom';
import { useMe } from '../api/queries';
import { Card, LoadingState, PageHeader } from '../components/ui';

export function BankingRoute({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me.isPending) return <LoadingState />;
  if (!me.data?.bankingAccess) return <Navigate to="/" replace />;
  if (!me.data.bankingEnabled) return <>
    <PageHeader eyebrow="Open banking" title="Banking" description="Connect accounts securely and bring your transactions into Spendime." />
    <Card><h2 className="font-bold">Bank connections are not available yet</h2><p className="mt-2 text-sm text-muted">{me.data.bankingStatus==='unconfigured' ? 'Bank connection setup is incomplete on this installation. Your administrator needs to finish configuring the secure connection.' : 'Bank connections have not been activated on this installation. You can keep tracking your money manually.'}</p><Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand underline" to="/accounts">Add a manual account →</Link></Card>
  </>;
  return children;
}
