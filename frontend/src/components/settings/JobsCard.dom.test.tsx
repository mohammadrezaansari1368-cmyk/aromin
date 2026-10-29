// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JobsCard from './JobsCard'
import type { Session } from '@/lib/auth'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const session = { name:'مدیر',role:'manager',user:'boss',pass:'',token:'synthetic',tenant:'team' } as Session
let root: Root, el: HTMLDivElement
const flush = async () => { for (let i=0;i<4;i++) await act(async () => { await new Promise(r=>setTimeout(r,0)) }) }
const button = (name: string) => [...el.querySelectorAll('button')].find(b=>b.textContent===name)!
beforeEach(()=> { el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);localStorage.clear() })
afterEach(()=> { act(()=>root.unmount());el.remove();vi.unstubAllGlobals() })

describe('durable report queue',()=> {
  it('reuses the same request key after an uncertain network result',async ()=> {
    const sent: Record<string,unknown>[]=[]
    let rows: unknown[]=[]
    vi.stubGlobal('fetch',vi.fn(async (_url: string,init: RequestInit)=> {
      if(init.method==='POST') {
        const body=JSON.parse(String(init.body));sent.push(body)
        rows=[{id:'job-1',kind:'performance_report',status:'queued',attempts:0,max_attempts:3,created_at:Date.now()}]
        if(sent.length===1) throw new Error('اتصال قطع شد')
        return {ok:true,json:async()=>({ok:true,job:rows[0]})}
      }
      return {ok:true,json:async()=>({ok:true,jobs:rows})}
    }))
    await act(async()=>root.render(<JobsCard session={session}/>));await flush()
    await act(async()=>button('افزودن به صف').click());await flush()
    expect(el.textContent).toContain('اتصال قطع شد')
    await act(async()=>button('افزودن به صف').click());await flush()
    expect(sent).toHaveLength(2)
    expect(sent[0].idempotencyKey).toBe(sent[1].idempotencyKey)
    expect(sent[0].tenant).toBe('team')
    expect(el.textContent).toContain('در صف')
  })
  it('shows a server-side disabled message and makes no request for non-managers',async()=> {
    const fetch=vi.fn(async()=>({ok:false,json:async()=>({ok:false,error:'صف پردازش هنوز فعال نشده است.'})}))
    vi.stubGlobal('fetch',fetch)
    await act(async()=>root.render(<JobsCard session={session}/>));await flush()
    expect(el.querySelector('[role=alert]')?.textContent).toContain('هنوز فعال نشده')
    fetch.mockClear()
    await act(async()=>root.render(<JobsCard session={{...session,role:'sales'}}/>));await flush()
    expect(fetch).not.toHaveBeenCalled()
    expect(el.textContent).toBe('')
  })
  it('uses the tenant-scoped cancellation action for a running job',async()=> {
    const requests: string[]=[]
    const job={id:'job-1',kind:'ledger_audit',status:'running',attempts:1,max_attempts:3,created_at:Date.now()}
    vi.stubGlobal('fetch',vi.fn(async(url: string,init: RequestInit)=> {
      requests.push(url)
      if(init.method==='POST') { expect(JSON.parse(String(init.body)).tenant).toBe('team'); job.status='cancelled'; return {ok:true,json:async()=>({ok:true,job})} }
      return {ok:true,json:async()=>({ok:true,jobs:[job]})}
    }))
    await act(async()=>root.render(<JobsCard session={session}/>));await flush()
    await act(async()=>button('لغو').click());await flush()
    expect(requests).toContain('/api/jobs/job-1/cancel')
    expect(el.textContent).toContain('لغوشده')
    expect(el.textContent).not.toContain('تلاش دوباره')
  })
})
