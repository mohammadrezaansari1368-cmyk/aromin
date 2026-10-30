import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { toMetric, toPerson } from '../data/adapters'
import AchievementBreakdown from '../sections/AchievementBreakdown'
import EffortPanel from '../cluster/EffortPanel'
import { effortOf } from '../lib/effort'

describe('WO2 sales UI', () => {
 it('renders actuals, targets, weighted breakdown, missing count and calendar basis', () => {
  const activity = toMetric({id:'activity',value:457,status:'valid',basis:'calendar'})
  const efficiency = toMetric({id:'efficiency',value:50,status:'partial',answerRate:80,parts:{activity:{actual:457,target:1040,pct:43.9},count:{actual:2,target:null,pct:null},amount:{actual:30,target:60,pct:50},weights:{activity:.5,count:0,amount:.5}}})
  const html = renderToStaticMarkup(<AchievementBreakdown metrics={[activity,efficiency]} />)
  for (const label of ['تقویم','فعالیت','تعداد قرارداد','مبلغ قرارداد','وزن','نرخ پاسخ','۴۵۷','۱٬۰۴۰','۴۳٫۹']) expect(html).toContain(label)
  expect(html.match(/class="pv-mini-star"/g)).toHaveLength(5)
  expect(html).toContain('—')
 })
 it('renders mixed daily basis, contribution counts and missing-card issue', () => {
  const metric=toMetric({id:'activity',value:10,status:'partial',basis:'mixed',attendanceDays:2,calendarDays:3,targetStatus:'partial',targetIssues:[{personId:'1',metric:'activity',reason:'کارتِ حضورِ این شخص نگاشت نشده'}]})
  expect(metric.targetStatus).toBe('partial')
  const html=renderToStaticMarkup(<AchievementBreakdown metrics={[metric]} />)
  for (const text of ['حضور و تقویم','حضور: ۲','تقویم: ۳','کارتِ حضورِ این شخص نگاشت نشده']) expect(html).toContain(text)
 })
 it('renders 4–6 hours in the yellow normal zone and peak share below effort', () => {
  for (const hours of [4,5,6]) {
   const effort=effortOf({talkMin:hours*60,activeDays:1})
   expect(effort.zone).toBe('normal')
   const html=renderToStaticMarkup(<EffortPanel effort={effort} callTarget={40} taskTarget={null} sales={null} salesTarget={null} callHours={{}} peakHourShare={50} onImport={() => {}} />)
   expect(html).toContain('data-zone="normal"'); expect(html).toContain('سهم تماس در ساعت پیک: ۵۰٪')
  }
  const css=readFileSync(new URL('../perf-v2.css',import.meta.url),'utf8')
  expect(css).toContain('.pv-ez-normal { stroke: #eab308; }')
  expect(css).toContain('.pv-effort[data-zone=normal] .pv-ef-val em { color: #eab308; }')
 })
 it('preserves level from API and offers the required saved values in the existing person editor', () => {
  expect(toPerson({id:'1',name:'Test',level:'middle'}).level).toBe('middle')
  const editor=readFileSync(new URL('../../../../../../deployment/legacy.html',import.meta.url),'utf8')
  expect(editor).toContain('[["senior","سنیور"],["middle","میدل"],["junior","جونیور"]]')
 })
})
