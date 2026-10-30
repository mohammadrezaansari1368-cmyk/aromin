// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AchievementBreakdown from '../sections/AchievementBreakdown'
import { YearHeatmap } from '../sections/YearHeatmap'
import { TaskTracker } from '../sections/TaskTracker'
import { toMetric } from '../data/adapters'
import type { Session } from '@/lib/auth'

vi.mock('../data/hooks',()=>({usePerf:vi.fn(()=>({loading:false,data:{ok:true,days:[{date:'1405/07/01',value:7,status:'valid'}],taskTargets:{daily:{'1405/07/01':15},monthly:300,target:300}}}))}))
// Canvas rasterization is outside jsdom; retain the real calendar grid builder.
vi.mock('@/components/ui/contribution-skyline',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/components/ui/contribution-skyline')>()
 return {...actual,default:({data,startDate,endDate,rtl,onCellClick}:{data:{date:string;count:number}[];startDate:string;endDate:string;rtl:boolean;onCellClick:(d:{date:string;count:number})=>void})=>{
  const grid=actual.buildGrid(data,Date.parse(endDate),6,Date.parse(startDate))
  return <div data-rtl={String(rtl)}>{grid.cells.map(c=><button key={c.date} data-count={c.count} onClick={()=>onCellClick(c)}>{c.date}: {c.count}</button>)}</div>
 }}
})

let host:HTMLDivElement,root:ReturnType<typeof createRoot>
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:true}));host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()})

it('renders five accessible Starlight gauges with values and weights',async()=>{
 const efficiency=toMetric({id:'efficiency',value:90,status:'valid',answerRate:64,parts:{activity:{actual:40,target:80,pct:50},count:{actual:3,target:2,pct:150},amount:{actual:100,target:100,pct:100},weights:{activity:.3,count:.3,amount:.4}}})
 const conversion=toMetric({id:'conversion',value:25,numerator:1,denominator:4,status:'valid',note:'نرخ تبدیل ماهانه است؛ بازه ماه را قطع کرده'})
 await act(async()=>root.render(<AchievementBreakdown metrics={[efficiency,conversion]} />))
 expect(host.querySelectorAll('.pv-mini-star')).toHaveLength(5)
 expect([...host.querySelectorAll('.pv-mini-star')].every(g=>g.getAttribute('aria-label')?.includes('٪'))).toBe(true)
 expect(host.textContent).toContain('وزن')
 expect(host.textContent).toContain('بازه ماه را قطع کرده')
})

it('renders fixture heatmap cells for the selected Jalali year in RTL',async()=>{
 await act(async()=>root.render(<YearHeatmap days={[{date:'1405/07/01',value:7}]} year={1405} setYear={()=>{}} metric="tasks" setMetric={()=>{}} unit="وظیفه" onDay={()=>{}} needPerson={false} />))
 expect(host.querySelector('[data-count="7"]')).not.toBeNull()
 expect(host.querySelector('[data-rtl="true"]')).not.toBeNull()
 await act(async()=>root.render(<YearHeatmap days={[{date:'1405/07/01',value:7}]} year={1404} setYear={()=>{}} metric="tasks" setMetric={()=>{}} unit="وظیفه" onDay={()=>{}} needPerson={false} />))
 expect(host.querySelector('[data-count="7"]')).toBeNull()
})

it('renders server task rows and uses attendance-adjusted server daily target',async()=>{
 const {usePerf}=await import('../data/hooks')
 await act(async()=>root.render(<TaskTracker session={{role:'manager'} as Session} person="898" year={1405} monthlyTarget={300} holidays={new Set()} start="1405/07/01" end="1405/07/15" onDay={()=>{}} />))
 expect(usePerf).toHaveBeenCalledWith(expect.anything(),'daily',{person:'898',start:'1405/07/01',end:'1405/07/15',metric:'tasks'},true)
 expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
 expect(host.querySelector('tbody')?.textContent).toContain('۱۵')
 const pct=[...host.querySelectorAll('button')].find(b=>b.textContent==='تحقق هدف ٪')!
 await act(async()=>pct.click())
 expect(host.querySelector('[data-count="47"]')).not.toBeNull()
})
