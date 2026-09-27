import { Archive, Pencil, Plus, RotateCcw, Shapes, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useArchiveCategory, useCategories, useCreateCategory, useUpdateCategory, useRestoreCategory, usePermanentlyDeleteCategory } from '../api/queries';
import type { Category, CategoryInput } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Input, LoadingState, Modal, PageHeader, Select } from '../components/ui';
const blank:CategoryInput={name:'',kind:'expense',color:'#d06f4b',icon:null};

export default function CategoriesPage(){
  const query=useCategories(true);
  const [dialog,setDialog]=useState<{open:boolean;value:Category|null}>({open:false,value:null});
  return <><PageHeader eyebrow="Organization" title="Categories" description="Categories answer: what was this money for? Default categories belong to you and can be renamed, customized or removed." action={<Button onClick={()=>setDialog({open:true,value:null})}><Plus className="size-4"/>Add category</Button>}/>
    {query.isPending?<LoadingState/>:query.isError?<ErrorState error={query.error} retry={()=>query.refetch()}/>:query.data.length===0?<EmptyState icon={<Shapes/>} title="No categories" description="Create a category to make your spending breakdown more useful."/>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{query.data.map(item=><Card key={item.id} className={`card-lift flex items-center gap-3 p-4 ${item.isArchived?'bg-brand/[.025]':''}`}><span className="size-3 shrink-0 rounded-full shadow-sm ring-4 ring-brand/[.035]" style={{backgroundColor:item.color??'#879392'}}/><div className="min-w-0 flex-1"><p className="break-words font-semibold">{item.name}</p><div className="mt-1.5 flex flex-wrap gap-1"><Badge>{item.kind}</Badge>{item.isSystem&&<Badge tone="info">Default</Badge>}{item.isArchived&&<Badge>Archived</Badge>}</div></div><button className="control-press grid size-11 shrink-0 place-items-center rounded-xl outline-none hover:bg-brand/[.06] focus-visible:ring-2 focus-visible:ring-accent active:scale-95" onClick={()=>setDialog({open:true,value:item})} aria-label={`${item.isArchived?'Manage':'Edit'} ${item.name}`}>{item.isArchived?<Archive className="size-4"/>:<Pencil className="size-4"/>}</button></Card>)}</div>}
    <CategoryDialog {...dialog} onClose={()=>setDialog({open:false,value:null})}/></>;
}
function CategoryDialog({open,value,onClose}:{open:boolean;value:Category|null;onClose:()=>void}){
  const [form,setForm]=useState<CategoryInput>(blank);
  const create=useCreateCategory(); const update=useUpdateCategory(value?.id??''); const archive=useArchiveCategory();
  const restore=useRestoreCategory(value?.id??''); const remove=usePermanentlyDeleteCategory();
  const mutation=value?update:create;
  const busy=mutation.isPending||archive.isPending||restore.isPending||remove.isPending;
  useEffect(()=>{
    setForm(value?{name:value.name,kind:value.kind,color:value.color,icon:value.icon}:blank);
    create.reset();update.reset();archive.reset();restore.reset();remove.reset();
  },[value,open]);
  return <Modal open={open} onClose={()=>{if(!busy)onClose();}} title={value?.isArchived?'Archived category':value?'Edit category':'New category'}><form className="grid gap-4" onSubmit={(e:FormEvent)=>{e.preventDefault();if(!busy&&!value?.isArchived)mutation.mutate(form,{onSuccess:onClose});}}>
    {value?.isArchived&&<p className="text-sm text-muted">Restore this category to use and edit it again. Permanent deletion keeps financial entries but makes them uncategorized and removes associated bank categorization rules.</p>}
    <Field label="Name"><Input value={form.name} maxLength={80} disabled={busy||value?.isArchived} onChange={e=>setForm({...form,name:e.target.value})} required/></Field>
    <Field label="Used for"><Select value={form.kind} disabled={busy||value?.isArchived} onChange={e=>setForm({...form,kind:e.target.value as Category['kind']})}><option value="expense">Expenses</option><option value="income">Income</option><option value="both">Both</option></Select></Field>
    <Field label="Color"><Input type="color" value={form.color??'#d06f4b'} disabled={busy||value?.isArchived} onChange={e=>setForm({...form,color:e.target.value})}/></Field>
    <FormError error={mutation.error||archive.error||restore.error||remove.error}/>
    {value&&!value.isArchived&&<p className="text-sm text-muted">Archiving hides this category from new entries and keeps historical labels. Archive it first to delete it permanently.</p>}
    <div className="flex flex-wrap gap-2">{value?.isArchived?<>
      <Button type="button" variant="danger" disabled={busy} loading={remove.isPending} onClick={()=>{if(confirm(`Permanently delete "${value.name}"? Transactions and recurring payments will be kept but become uncategorized. Associated bank categorization rules will be removed. This cannot be undone.`))remove.mutate(value.id,{onSuccess:onClose});}}><Trash2 className="size-4"/>Delete permanently</Button>
      <Button type="button" className="ml-auto" disabled={busy} loading={restore.isPending} onClick={()=>restore.mutate(undefined,{onSuccess:onClose})}><RotateCcw className="size-4"/>Restore category</Button>
    </>:<>{value&&<Button type="button" variant="secondary" disabled={busy} loading={archive.isPending} onClick={()=>archive.mutate(value.id,{onSuccess:onClose})}><Archive className="size-4"/>Archive</Button>}<Button className="ml-auto" disabled={busy} loading={mutation.isPending}>Save category</Button></>}</div>
  </form></Modal>;
}
