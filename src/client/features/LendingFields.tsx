import { Field, Input } from '../components/ui';
import { useLanguage } from '../i18n';
export function LendingFields({ borrower, dueOn, onChange }: {
  borrower: string | null | undefined; dueOn: string | null | undefined;
  onChange: (borrower: string, dueOn: string | null) => void;
}) {
  const { t } = useLanguage();
  return <div className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
    <p className="text-sm text-blue-950">{t('You expect the full amount back. This is money owed to you, not everyday spending. Your account still records the original payment.')}</p>
    <Field label="Who owes you?" hint="A name you will recognize when they pay you back."><Input value={borrower ?? ''} maxLength={120} placeholder="e.g. Alex" required onChange={event => onChange(event.target.value, dueOn ?? null)} /></Field>
    <Field label="Expected back by" hint="Optional. Leave empty if no date was agreed."><Input type="date" value={dueOn ?? ''} onChange={event => onChange(borrower ?? '', event.target.value || null)} /></Field>
    <p className="text-xs text-muted">{t('When they repay you, choose Link repayment and select the money you received. Partial repayments are supported.')}</p>
  </div>;
}
