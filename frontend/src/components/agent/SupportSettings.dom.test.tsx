// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import SupportSettings from './SupportSettings'
import type {Session} from '@/lib/auth'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT:boolean }).IS_REACT_ACT_ENVIRONMENT=true
it('loads tenant settings and saves explicit proposed priorities without inventing brands',async()=>{
 const cfg={template:'{AGENT_NAME}',variables:{AGENT_NAME:'سروش',MEHR_CONTACT:'تنظیم نشده',SALES_CONTACT:'تنظیم نشده',SOROUSH_HANDOFF_CHANNEL:'صف',TICKET_TOOL:'ticket'},brands:[],priorities:{P1:'بحرانی',P2:'بالا',P3:'متوسط',P4:'پایین'},prioritiesConfirmed:false}
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>({ok:true,json:async()=>({ok:true,settings:init?.method==='PUT'?JSON.parse(String(init.body)):cfg,todayJalali:'1405/08/05'})}))
 vi.stubGlobal('fetch',fetcher)
 const el=document.createElement('div');const root=createRoot(el)
 try{
 await act(async()=>root.render(<SupportSettings session={{token:'synthetic'} as Session} tenant="a"/>))
 await act(async()=>{(el.querySelector('button') as HTMLButtonElement).click()})
 expect(el.textContent).toContain('پیشنهادی');expect((el.querySelector('[aria-label="برندها"]') as HTMLTextAreaElement).value).toBe('')
 await act(async()=>{(Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='ذخیره تنظیمات پشتیبانی') as HTMLButtonElement).click()})
 expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body)).brands).toEqual([])
 }finally{act(()=>root.unmount());vi.unstubAllGlobals()}
})
