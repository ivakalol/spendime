import { useState } from 'react';
import { useTransactions } from '../api/queries';
import type { Transaction } from '../api/types';
import { Button, ErrorState, Field, Input, Modal } from '../components/ui';
import { useLanguage } from '../i18n';
import { formatMoney } from '../utils/money';

export function ReceivedPaymentPicker({ expense, onSelect, onClose }: { expense: Transaction; onSelect: (item: Transaction) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const query = useTransactions(new URLSearchParams({kind:'income',search,limit:'25',offset:String(page*25),sort:'occurredAt',direction:'desc'}));
  return <Modal open title="Choose received payment" description="Select the bank transfer you already received. It will be linked to the expense without adding money twice." onClose={onClose}>
    <p className="mb-3 font-semibold" translate="no">{expense.isLending ? t('Money lent to {name}',{name:expense.loanBorrower ?? ''}) : expense.description || expense.merchant || t('Expense')} · {formatMoney(expense.amount,expense.currency)}</p>
    <Field label="Search received payments"><Input type="search" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}} maxLength={120}/></Field>
    {query.isPending && <p role="status">{t('Loading accounts…')}</p>}
    {query.isError && <ErrorState error={query.error} retry={()=>query.refetch()}/>}
    <div className="mt-3 grid gap-2">{query.data?.data.filter(item=>item.currency===expense.currency).map(item=><Button key={item.id} variant="secondary" onClick={()=>onSelect(item)}><span translate="no">{item.description || item.merchant || item.occurredAt.slice(0,10)} · {formatMoney(item.amount,item.currency)}</span></Button>)}</div>
    {query.isSuccess && !query.data.data.some(item=>item.currency===expense.currency) && <p className="mt-3 text-sm text-muted">{t('No received payments found. Try another search or page.')}</p>}
    <div className="mt-3 flex justify-between"><Button variant="ghost" disabled={!page} onClick={()=>setPage(page-1)}>{t('Previous')}</Button><Button variant="ghost" disabled={!query.data || (page+1)*25>=query.data.meta.total} onClick={()=>setPage(page+1)}>{t('Next')}</Button></div>
  </Modal>;
}
