import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, RefreshCw, Unplug } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { apiRequest, jsonBody } from '../api/client';
import { keys, useAccounts, useMe } from '../api/queries';
import type { Account, ApiEnvelope } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Input, LoadingState, PageHeader, Select } from '../components/ui';
import { formatMoney } from '../utils/money';

type Institution = { name:string; country:string; beta:boolean };
type Link = { id:string; name:string; currency:string; accountId:string|null; linkMode:string|null; automaticPostAfter:string|null; reviewCount:number; reportedBalance:string|null; balanceAsOf:string|null; balanceStatus:string; lastSyncedAt:string|null; ledgerBalance:string|null };
type Connection = { id:string; provider:string; environment:string; institutionName:string; institutionCountry:string; status:string; consentExpiresAt:string|null; lastSyncedAt:string|null; nextSyncAt:string|null; errorCode:string|null; accounts:Link[] };
const get = async <T,>(path:string) => (await apiRequest<ApiEnvelope<T>>(path)).data;
const post = async <T,>(path:string, body?:unknown) => (await apiRequest<ApiEnvelope<T>>(path,{method:'POST',...(body===undefined?{}:jsonBody(body))})).data;
const date = (value:string|null) => value ? new Date(value).toLocaleString() : 'Not yet';

export default function BankingPage() {
  const qc=useQueryClient();
  const production=useMe().data?.bankingEnvironment==='production';
  const [country,setCountry]=useState('BG'); const [search,setSearch]=useState('');
  const [notice,setNotice]=useState(new URLSearchParams(location.search).get('result'));
  const institutions=useQuery({queryKey:['banking','institutions',country],queryFn:()=>get<Institution[]>(`/api/banking/institutions?country=${country}`),retry:false});
  const connections=useQuery({queryKey:['banking','connections'],queryFn:()=>get<Connection[]>('/api/banking/connections'),refetchInterval:30_000,retry:false});
  const accounts=useAccounts(false);
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['banking']}),qc.invalidateQueries({queryKey:keys.accounts}),qc.invalidateQueries({queryKey:keys.transactions}),qc.invalidateQueries({queryKey:keys.dashboard})]);};
  const connect=useMutation({mutationFn:(bank:Institution)=>post<{authorizationUrl:string}>('/api/banking/connections',{country:bank.country,name:bank.name}),onSuccess:(value)=>{location.assign(value.authorizationUrl);}});
  const renew=useMutation({mutationFn:(id:string)=>post<{authorizationUrl:string}>(`/api/banking/connections/${id}/renew`),onSuccess:(value)=>{location.assign(value.authorizationUrl);}});
  const sync=useMutation({mutationFn:(id:string)=>post(`/api/banking/connections/${id}/sync`),onSuccess:refresh});
  const disconnect=useMutation({mutationFn:(id:string)=>apiRequest(`/api/banking/connections/${id}/disconnect`,{method:'POST'}),onSuccess:refresh});
  const forget=useMutation({mutationFn:(id:string)=>apiRequest(`/api/banking/connections/${id}/data`,{method:'DELETE'}),onSuccess:refresh});
  const link=useMutation({mutationFn:({id,accountId}:{id:string;accountId:string|null})=>post(`/api/banking/links/${id}/link`,{accountId}),onSuccess:refresh});
  const reconcile=useMutation({mutationFn:(id:string)=>post(`/api/banking/links/${id}/reconcile`),onSuccess:refresh});
  const bankList=institutions.data?.filter((item)=>item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <>
    <PageHeader eyebrow="Open banking" title="Banking" description="Connect a bank through its secure authorization page." />
    <Card className="mb-5 border-amber-200 bg-amber-50/70"><div className="flex flex-wrap items-center gap-2"><Badge tone="warning">{production?'Restricted production':'Sandbox / evaluation'}</Badge><p className="text-sm text-muted">{production?'Only accounts linked in Enable Banking Restricted Mode can be accessed. Review the first booked import before enabling future automatic posting.':'Availability and bank behavior depend on Enable Banking. Public production access requires separate approval.'}</p></div></Card>
    {notice && <Card className="mb-5"><p className="text-sm">{notice==='connected'?'Bank authorization completed. Link each account below to import it.':'Bank authorization was not completed. You can try again.'}</p><Button variant="ghost" onClick={()=>{setNotice(null);history.replaceState({},'',location.pathname);}}>Dismiss</Button></Card>}
    <Card className="mb-5"><div className="mb-4 flex items-center gap-2"><Landmark className="size-5 text-brand"/><h2 className="font-bold">Connect a bank</h2></div>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><Field label="Country"><Select value={country} onChange={(e)=>setCountry(e.target.value)}><option value="BG">Bulgaria</option><option value="DE">Germany</option><option value="FR">France</option><option value="NL">Netherlands</option></Select></Field><Field label="Search banks"><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by bank name" /></Field></div>
      {institutions.isPending?<LoadingState label="Loading available banks…"/>:institutions.isError?<ErrorState error={institutions.error} retry={()=>institutions.refetch()}/>:<div className="mt-4 grid max-h-64 gap-2 overflow-auto">{bankList.length?bankList.map((bank)=><div key={`${bank.country}:${bank.name}`} className="flex items-center justify-between gap-2 rounded-2xl border border-brand/10 px-3 py-2"><span className="min-w-0 truncate text-sm font-medium">{bank.name} {bank.beta&&<Badge tone="warning">Beta</Badge>}</span><Button variant="secondary" disabled={connect.isPending} onClick={()=>connect.mutate(bank)}>Connect</Button></div>):<p className="py-4 text-sm text-muted">No matching banks were returned for this country.</p>}</div>}
      <FormError error={connect.error}/><p className="mt-3 text-xs text-muted">Spendime never asks for your banking password. Authorization happens with your bank through Enable Banking.</p>
    </Card>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Connected banks</h2><Button variant="ghost" onClick={()=>refresh()}><RefreshCw className="size-4"/>Refresh</Button></div>
    {connections.isPending?<LoadingState/>:connections.isError?<ErrorState error={connections.error} retry={()=>connections.refetch()}/>:!connections.data?.length?<EmptyState icon={<Landmark/>} title="No banks connected" description="Select a bank above to start a secure authorization."/>:<div className="grid gap-4">{connections.data.map((connection)=><Card key={connection.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{connection.institutionName}</h3><p className="text-xs text-muted">Last sync: {date(connection.lastSyncedAt)} · Consent ends: {date(connection.consentExpiresAt)}</p></div><Badge tone={connection.status==='active'?'positive':'warning'}>{connection.status}</Badge></div>
      {connection.errorCode&&<p className="mt-2 text-sm text-amber-800">{connection.errorCode==='consent_expired'?'Authorization expired. Renew to resume syncing.':connection.errorCode==='rate_limited'?'Bank requests are temporarily limited. Sync will retry later.':connection.errorCode==='authorization_failed'?'Authorization failed. Renew and try again.':connection.errorCode==='remote_revocation_unconfirmed'?'Local access was removed, but the bank did not confirm remote revocation. Revoke Spendime in your bank settings if needed.':'The last sync failed. Try again later.'}</p>}
      <div className="mt-4 grid gap-3">{connection.accounts.map((item)=><BankLink key={item.id} item={item} accounts={accounts.data??[]} link={link} reconcile={reconcile} canLink={connection.status==='active'} production={production}/>)}</div>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={sync.isPending||connection.status!=='active'||Boolean(connection.nextSyncAt&&new Date(connection.nextSyncAt)>new Date())} onClick={()=>sync.mutate(connection.id)}><RefreshCw className="size-4"/>Sync now</Button><Button variant="secondary" disabled={renew.isPending||connection.status==='disconnected'} onClick={()=>renew.mutate(connection.id)}>Renew access</Button><Button variant="danger" disabled={disconnect.isPending||connection.status==='disconnected'} onClick={()=>{if(confirm(`Disconnect ${connection.institutionName}? Imported transactions remain in your ledger.`))disconnect.mutate(connection.id);}}><Unplug className="size-4"/>Disconnect</Button>{connection.status==='disconnected'&&<Button variant="danger" disabled={forget.isPending} onClick={()=>{if(confirm('Remove stored bank connection and staging data? Imported ledger entries remain.'))forget.mutate(connection.id);}}>Remove bank data</Button>}</div><FormError error={sync.error||renew.error||disconnect.error||forget.error}/>
    </Card>)}</div>}
  </>;
}

function BankLink({item,accounts,link,reconcile,canLink,production}:{item:Link;accounts:Account[];link:any;reconcile:any;canLink:boolean;production:boolean}) {
  const [selected,setSelected]=useState('');
  return <div className="rounded-2xl border border-brand/10 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{item.name} · {item.currency}</p><p className="text-xs text-muted">Last sync: {date(item.lastSyncedAt)}</p></div><Badge tone={item.accountId?'positive':'warning'}>{item.accountId?'Linked':'Needs linking'}</Badge></div>
    {item.reportedBalance!==null&&<p className="mt-2 text-sm">Bank reported: <strong>{formatMoney(item.reportedBalance,item.currency)}</strong>{item.ledgerBalance!==null&&<> · Spendime ledger: <strong>{formatMoney(item.ledgerBalance,item.currency)}</strong></>}</p>}
    {!item.accountId&&canLink?<div className="mt-3 flex flex-wrap gap-2"><Button disabled={link.isPending} onClick={()=>link.mutate({id:item.id,accountId:null})}>Create money account</Button><Select aria-label="Link to existing money account" value={selected} onChange={(e)=>setSelected(e.target.value)}><option value="">Choose existing account</option>{accounts.filter((a)=>a.currency===item.currency&&!a.isArchived).map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</Select><Button variant="secondary" disabled={!selected||link.isPending} onClick={()=>link.mutate({id:item.id,accountId:selected})}>Link existing</Button><p className="w-full text-xs text-muted">{production?'The first imported history requires review before future automatic posting.':'Existing accounts require historical reconciliation before future imports can post automatically.'}</p></div>:item.accountId&&(item.reviewCount>0||((production||item.linkMode==='existing')&&!item.automaticPostAfter))?<RouterLink className="mt-3 inline-flex text-sm font-semibold text-brand underline" to="/banking/reconciliation">Review bank items{item.reviewCount>0?` (${item.reviewCount})`:''}</RouterLink>:null}
    {item.linkMode==='new'&&item.accountId&&item.balanceStatus!=='reconciled'&&item.reportedBalance!==null&&item.lastSyncedAt&&<div className="mt-3"><Button variant="secondary" disabled={reconcile.isPending} onClick={()=>{if(confirm('Calibrate this new account opening balance to the bank reported balance?'))reconcile.mutate(item.id);}}>Calibrate new account balance</Button></div>}
    <FormError error={link.error||reconcile.error}/>
  </div>;
}
