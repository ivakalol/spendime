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
  api.mockImplementation(async(path:string,options?:RequestInit)=>{
    if(options?.method==='DELETE')return undefined;
    if(options?.method==='POST'||options?.method==='PATCH')return {data:{id:'default'}};
    return {data:[
      {id:'default',name:'Food',kind:'expense',color:'#123456',icon:null,isSystem:true,isArchived:false},
      {id:'archived',name:'Sport',kind:'expense',color:'#123456',icon:null,isSystem:false,isArchived:true},
    ]};
  });
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LanguageProvider><CategoriesPage/></LanguageProvider></QueryClientProvider>);
}
describe('category management',()=>{
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
