import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { apiRequest, jsonBody } from '../api/client';
import { useMe } from '../api/queries';
import type { ApiEnvelope } from '../api/types';
import { Badge, Button, Card, ErrorState, FormError, LoadingState, PageHeader, Select, Field } from '../components/ui';
import { formatInTimezone } from '../utils/dateTime';
import { formatMoney } from '../utils/money';

type Review = { id:string; bankAccountLinkId:string; accountName:string; direction:string; amount:string; currency:string; occurredOn:string; merchant:string|null; description:string|null; ledgerTransactionId:string|null; proposedAmount:string|null; proposedCurrency:string|null; proposedOccurredOn:string|null };
type Candidate = { id:string; description:string|null; merchant:string|null; amount:string; currency:string; occurredAt:string; kind:string };
type BankLink = { id:string; name:string; linkMode:'new'|'existing'|null; lastSyncedAt:string|null; automaticPostAfter:string|null; historyIgnoredBefore:string|null; unresolvedReviewCount:number };
type Connection = { id:string; accounts:BankLink[] };
const get = async <T,>(path:string) => (await apiRequest<ApiEnvelope<T>>(path)).data;
const post = async (path:string, body?:unknown) => apiRequest(path,{method:'POST',...(body===undefined?{}:jsonBody(body))});

export default function BankingReconciliationPage() {
  const qc=useQueryClient();
  const production=useMe().data?.bankingEnvironment==='production';
  const reviews=useQuery({queryKey:['banking','review'],queryFn:()=>get<Review[]>('/api/banking/review')});
  const connections=useQuery({queryKey:['banking','connections'],queryFn:()=>get<Connection[]>('/api/banking/connections')});
  const complete=useMutation({mutationFn:(id:string)=>post(`/api/banking/links/${id}/complete-initial-review`),onSuccess:()=>qc.invalidateQueries({queryKey:['banking']})});
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['banking']}),qc.invalidateQueries({queryKey:['transactions']}),qc.invalidateQueries({queryKey:['dashboard']}),qc.invalidateQueries({queryKey:['accounts']})]);};
  const [notice,setNotice]=useState('');
  const startToday=useMutation({mutationFn:(id:string)=>post(`/api/banking/links/${id}/start-from-today`),onSuccess:async()=>{
    setNotice('Imported history was ignored. Your manual transactions and recorded balance were kept. New items booked today still need review; later booking dates can post automatically.');
    await refresh();
  }});
  const existing=connections.data?.flatMap(connection=>connection.accounts.filter(link=>link.linkMode==='existing'||(production&&link.linkMode==='new')))??[];
  return <>
    <PageHeader eyebrow="Open banking" title="Bank reconciliation" description="Keep your manual history and start bank imports from today, or review historical items individually. Changes to previously imported entries always need review." />
    <Link to="/banking" className="mb-5 inline-block text-sm font-semibold text-brand underline">Back to Banking</Link>
    {notice&&<Card className="mb-4"><p role="status" className="text-sm">{notice}</p></Card>}
    {connections.isPending||reviews.isPending?<LoadingState/>:connections.isError?<ErrorState error={connections.error} retry={()=>connections.refetch()}/>:reviews.isError?<ErrorState error={reviews.error} retry={()=>reviews.refetch()}/>:<>
      {existing.map(link=>{
        const unresolved=link.unresolvedReviewCount;
        return <Card key={link.id} className="mb-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{link.name}</h2><p className="text-sm text-muted">{unresolved} items still need a decision.</p></div><Badge tone={link.automaticPostAfter?'positive':'warning'}>{link.automaticPostAfter?'Future imports automatic':'Initial review'}</Badge></div>
          {link.historyIgnoredBefore?<p className="mt-3 text-sm text-muted">Manual history kept. Bank items dated before {link.historyIgnoredBefore} stay ignored. New items on the start date need review to prevent duplicates.</p>:<div className="mt-3 rounded-2xl border border-brand/10 p-3"><p className="text-sm font-semibold">Already tracking this account manually?</p><p className="mt-1 text-sm text-muted">Keep your recorded transactions and balance. Ignore the imported backlog, including items already fetched today, and start importing new activity. New items booked today still need review; later dates can post automatically.</p><Button className="mt-3" disabled={!link.lastSyncedAt||startToday.isPending} loading={startToday.isPending&&startToday.variables===link.id} onClick={()=>{
            if(confirm(`Start importing from today for ${link.name}? Unposted bank items already imported through today will be ignored. Your manual transactions and balance will stay unchanged. New items booked today still need review.`))startToday.mutate(link.id);
          }}>Start importing from today</Button>{!link.lastSyncedAt&&<p className="mt-2 text-sm text-muted">Sync this bank account first.</p>}<FormError error={startToday.variables===link.id?startToday.error:null}/></div>}
          {!link.automaticPostAfter&&<><p className="mt-3 text-sm text-muted">Match a manual entry or post each historical movement below. Once the first bank sync is complete and none remain, enable automatic posting for later booking dates.</p><Button className="mt-3" disabled={!link.lastSyncedAt||unresolved>0||complete.isPending} onClick={()=>complete.mutate(link.id)}>Complete initial review</Button><FormError error={complete.error}/></>}
        </Card>;
      })}
      <Card><h2 className="font-bold">Items needing review</h2>{reviews.data?.length?reviews.data.map(item=><ReviewRow key={item.id} item={item} refresh={refresh}/>):<p className="mt-3 text-sm text-muted">No bank movements need review.</p>}</Card>
    </>}
  </>;
}

function ReviewRow({item,refresh}:{item:Review;refresh:()=>Promise<void>}) {
  const [selected,setSelected]=useState('');
  const timezone=useMe().data?.timezone??'UTC';
  const candidates=useQuery({queryKey:['banking','candidates',item.id],queryFn:()=>get<Candidate[]>(`/api/banking/review/${item.id}/candidates`),enabled:!item.ledgerTransactionId});
  const postTx=useMutation({mutationFn:()=>post(`/api/banking/review/${item.id}/post`),onSuccess:refresh});
  const match=useMutation({mutationFn:()=>post(`/api/banking/review/${item.id}/match`,{transactionId:selected}),onSuccess:refresh});
  const keep=useMutation({mutationFn:()=>post(`/api/banking/review/${item.id}/keep`),onSuccess:refresh});
  return <div className="mt-3 rounded-2xl border border-brand/10 p-3"><p className="break-words text-sm font-semibold">{item.occurredOn} · {item.accountName} · {item.merchant||item.description||'Bank transaction'}</p><p className="text-sm text-muted">{item.direction==='credit'?'+':'−'}{formatMoney(item.amount,item.currency)}</p>{item.ledgerTransactionId?<div className="mt-2"><p className="mb-2 text-sm text-amber-800">The bank changed this record after import. Your existing ledger entry was preserved. {(item.proposedAmount||item.proposedCurrency)&&`Bank now reports ${formatMoney(item.proposedAmount||item.amount,item.proposedCurrency||item.currency)}.`} {item.proposedOccurredOn&&`New date: ${item.proposedOccurredOn}.`}</p><Button variant="secondary" disabled={keep.isPending} onClick={()=>keep.mutate()}>Keep existing entry</Button></div>:<div className="mt-2 flex flex-wrap gap-2"><div className="min-w-0 w-full"><Field label="Matching existing transaction"><Select aria-label="Matching existing transaction" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose an existing entry</option>{candidates.data?.map(candidate=><option key={candidate.id} value={candidate.id}>{formatInTimezone(candidate.occurredAt,timezone)} · {candidate.description||candidate.merchant||candidate.kind} · {formatMoney(candidate.amount,candidate.currency)}</option>)}</Select></Field></div>{candidates.isPending&&<p role="status" className="text-sm text-muted">Finding matching entries…</p>}{candidates.isError&&<ErrorState error={candidates.error} retry={()=>candidates.refetch()}/>}<Button variant="secondary" disabled={!selected||match.isPending||postTx.isPending} onClick={()=>match.mutate()}>Match entry</Button><Button loading={postTx.isPending} disabled={match.isPending} onClick={()=>postTx.mutate()}>Post as new</Button></div>}<FormError error={postTx.error||match.error||keep.error}/></div>;
}
