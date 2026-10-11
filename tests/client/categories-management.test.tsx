// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoriesPage from '../../src/client/pages/CategoriesPage';
import { LanguageProvider } from '../../src/client/i18n';

const api=vi.hoisted(()=>vi.fn());
vi.mock('../../src/client/api/client',()=>({apiRequest:api,jsonBody:(body:unknown)=>({body:JSON.stringify(body)})}));
afterEach(()=>{cleanup();api.mockReset();vi.restoreAllMocks();});
function mount(){
  let categories=[
    {id:'default',name:'Food',kind:'expense',color:'#123456',icon:null,isSystem:true,isArchived:false},
    {id:'archived',name:'Sport',kind:'expense',color:'#123456',icon:null,isSystem:false,isArchived:true},
  ];
  api.mockImplementation(async(path:string,options?:RequestInit)=>{
    if(path==='/api/categories/order'){
      const {ids}=JSON.parse(String(options?.body));
      categories=ids.map((id:string)=>categories.find(item=>item.id===id)!);
      return {data:categories};
    }
    if(options?.method==='DELETE')return undefined;
    if(options?.method==='POST'||options?.method==='PATCH')return {data:{id:'default'}};
    return {data:categories};
  });
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LanguageProvider><CategoriesPage/></LanguageProvider></QueryClientProvider>);
}
describe('category management',()=>{
  it('saves the chosen order and shows it after refreshing categories',async()=>{
    mount();
    await screen.findByRole('button',{name:'Edit Food'});
    fireEvent.click(await screen.findByRole('button',{name:'Reorder categories'}));
    expect(screen.getByRole('button',{name:'Move Food earlier'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Move Sport later'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Move Food later'}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/categories/order',expect.objectContaining({method:'PATCH',body:JSON.stringify({ids:['archived','default']})})));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Move Sport earlier'})).toBeDisabled());
    expect(screen.getByRole('button',{name:'Move Food later'})).toBeDisabled();
  });
  it('keeps the original order and displays an error when saving fails',async()=>{
    mount();
    await screen.findByRole('button',{name:'Edit Food'});
    fireEvent.click(await screen.findByRole('button',{name:'Reorder categories'}));
    api.mockRejectedValueOnce(new Error('Unable to save order'));
    fireEvent.click(screen.getByRole('button',{name:'Move Food later'}));
    expect(await screen.findByText('Unable to save order')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Move Food earlier'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Move Food later'})).toBeEnabled();
  });
  it('allows editing default categories without the system lock',async()=>{
    mount();
    fireEvent.click(await screen.findByRole('button',{name:'Edit Food'}));
    fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Groceries'}});
    fireEvent.click(screen.getByRole('button',{name:'Save category'}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/categories/default',expect.objectContaining({method:'PATCH',body:expect.stringContaining('Groceries')})));
  });
  it('offers restore and confirms permanent deletion for archived categories',async()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    mount();
    fireEvent.click(await screen.findByRole('button',{name:'Manage Sport'}));
    expect(screen.getByRole('button',{name:'Restore category'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Delete permanently'}));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('be kept but become uncategorized'));
    expect(api.mock.calls.some(([,options])=>options?.method==='DELETE')).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button',{name:'Delete permanently'}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/categories/archived/permanent',expect.objectContaining({method:'DELETE'})));
  });
  it('restores an archived category through its restore endpoint',async()=>{
    mount();
    fireEvent.click(await screen.findByRole('button',{name:'Manage Sport'}));
    fireEvent.click(screen.getByRole('button',{name:'Restore category'}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/categories/archived/restore',expect.objectContaining({method:'POST'})));
  });
});
