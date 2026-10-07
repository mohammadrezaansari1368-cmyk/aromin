import { describe, it, expect } from 'vitest'
import { excelSaleDate, saleDateOf, saleTimeOf } from './sales-date'
import { monthlySeries } from './ledger-analysis'
import { planDealImport, applyDealImport } from '@/engines/deal-import'
import { freshS } from '@/engines/commission'
// قراردادِ تأییدشده: سالِ مالی، روزِ فروش و ساعت فقط از سلولِ «تغییر مرحله»؛ «تاریخ فروش»، «سال مالی» و «ورود» منبع نیستند
const row = (values: Record<string,unknown> = {}): Record<string,unknown> => ({'شماره فاکتور':'INV-7','مشتری':'مشتری','ارزش':100000000,'کارشناس':'فروشنده','سال مالی':'1404','تاریخ فروش':'1405/07/09','ورود':'1405/06/01','تغییر مرحله':'16:30:00 1405/07/05','مرحله':'بستن',...values})
const opts = {mode:'append' as const,rial:false,fileName:'sales.xlsx',sig:'test',custbook:null}
const state = () => ({fy:'1405',years:{1405:{},1404:{}},people:[{id:1,name:'فروشنده',S:freshS(),invY:{1404:[{id:6,no:'OLD',amount:100}],1405:[]}}]})
describe('Excel sale date import and chart', () => {
 it('converts Persian, Gregorian and Excel serial dates with either epoch', () => {
  expect(excelSaleDate('۱۴۰۵/۷/۵')).toBe('1405/07/05')
  expect(excelSaleDate('2026-09-27')).toBe('1405/07/05')
  const serial=Date.UTC(2026,8,27)/86400000+25569
  expect(excelSaleDate(serial)).toBe('1405/07/05')
  expect(excelSaleDate(serial-1462,true)).toBe('1405/07/05')
  expect(excelSaleDate('1405/07/31')).toBe('');expect(excelSaleDate(5)).toBe('')
 })
 it('sale day and time come from the stage-change cell; registration, «تاریخ فروش» and «سال مالی» are not sources', () => {
  const P=planDealImport([row()],state(),opts)
  expect(P.groups['فروشنده'][0]).toMatchObject({saleDate:'1405/07/05',saleTime:'16:30:00',entry:'1405/06/01',stageChangedAt:'16:30:00 1405/07/05',month:6,fy:'1405'})
  const points=monthlySeries(P.groups['فروشنده'],'1405/07/13')
  expect(points[4].desktop).toBe(100000000);expect(points[9].desktop).toBe(0)
 })
 it('enriches even a locked duplicate without touching invoice data or prior-year records', () => {
  const invoice={id:7,no:'INV-7',name:'مشتری',month:6,amount:100000000,funnel:'won',finState:'approved',finApproval:{by:'مالی'}}
  const full:any=state();full.people[0].invY['1405']=[invoice]
  const before=JSON.stringify(full.people)
  const P=planDealImport([row()],full,opts)
  expect(P.total).toBe(0);expect(P.cnt.duplicate).toBe(1);expect(P.dateUpdates).toEqual([{key:'1:7',date:'1405/07/05',time:'16:30:00'}])
  applyDealImport(full,[row()],opts)
  expect(JSON.stringify(full.people)).toBe(before)
  expect(saleDateOf(invoice,full.saleDates['1405'],1)).toBe('1405/07/05')
  expect(saleTimeOf(invoice,full.saleTimes['1405'],1)).toBe('16:30:00')
  expect(planDealImport([row()],full,opts).dateUpdates).toEqual([])
  expect(planDealImport([row({'تغییر مرحله':'10:00:00 1405/07/06'})],full,opts).dateUpdates).toEqual([])
 })
 it('does not infer a sale day from registration, nor a fiscal year from «سال مالی» or «ورود»', () => {
  const P=planDealImport([row({'تغییر مرحله':''})],state(),opts)
  expect(P.cnt.invalid).toBe(1);expect(P.total).toBe(0)
  expect(planDealImport([row({'تغییر مرحله':'09:00:00 1404/11/02','سال مالی':'1405','ورود':'1405/01/01'})],state(),opts).cnt.previous).toBe(1)
  const noStage=row();delete noStage['تغییر مرحله'];expect(planDealImport([noStage],state(),opts).error).toBeTruthy()
 })
 it('rejects invalid stage-change dates, and does not enrich ambiguous duplicate invoice numbers', () => {
  expect(planDealImport([row({'تغییر مرحله':'16:30:00 1405/07/31'})],state(),opts).cnt.invalid).toBe(1)
  const full:any=state();full.people[0].invY['1405']=[{id:7,no:'INV-7',funnel:'won'},{id:8,no:'INV-7',funnel:'won'}]
  expect(planDealImport([row()],full,opts).dateUpdates).toEqual([])
 })
})
