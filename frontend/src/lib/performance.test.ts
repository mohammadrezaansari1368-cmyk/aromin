import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import {
	DEFAULT_SETTINGS, EMPTY_FILTER, lateRows, mergedTasks, parseTaskRows, parseTaskWorkbook, personSummary, processSheet, resolveLink, rules, taskStats, ownerKey,
	type RawTask, type ResolvedLink, type RowEdit,
} from './performance'

const R = rules(DEFAULT_SETTINGS)
const LINK: ResolvedLink = { person: 'تست', personHow: 'strong', owner: 'id:1', ownerName: 'تست', ownerHow: 'strong' }
/** ردیفِ خامِ دستگاهِ حضور (ساعت به صورتِ متن) */
const day = (date: string, entry: string | null, exit: string | null, dayName = 'شنبه', note = '') => ({ 'نام': 'فاطمه', 'نام خانوادگي': 'اميري', 'تاريخ': date, 'روز': dayName, 'ورود 1': entry, 'خروج 1': exit, 'حضور': note || null })
const task = (id: string, date: string, start: string, end: string, stage = 'انجام شده', desc = ''): RawTask => ({
	id, person: 'خانم تست', pid: '1', title: 'جلسه حضوری با مشتری', date, start: +start.split(':')[0] * 60 + +start.split(':')[1], endDate: date, end: end ? +end.split(':')[0] * 60 + +end.split(':')[1] : null, stage, desc, contact: '', hist: 0, fileTo: '',
})
const run = (rows: ReturnType<typeof day>[], tasks: RawTask[] | null = null, edits: Record<string, RowEdit> = {}) => processSheet(rows, 'شیت', R, LINK, null, tasks, edits, 'فروش')!

describe('قواعد دیرکرد', () => {
	it('۱۰:۱۵ دیرکرد نیست؛ ۱۰:۱۶ به بعد از ۱۰:۰۰ شمرده می‌شود', () => {
		const p = run([day('1405/06/01', '10:15', '18:00'), day('1405/06/02', '10:17', '18:00'), day('1405/06/03', '10:26', '18:00')])
		expect(p.rows.map((r) => r.lateMinutes)).toEqual([0, 17, 26])
	})
	it('هر ۰۸:۰۰ دیرکردِ قابل کسر = ۱ روز و مانده حفظ می‌شود', () => {
		// ۶ روز × ۹۲.۵ دقیقه ≈ ۰۹:۱۵
		const rows = ['01', '02', '03', '04', '05'].map((d) => day('1405/06/' + d, '11:51', '18:00')).concat([day('1405/06/06', '11:50', '18:00')])
		const s = personSummary(run(rows), EMPTY_FILTER, R)
		expect(s.lateTotal).toBe(5 * 111 + 110) // 665 = 11:05
		expect(s.deductedDays).toBe(1)
		expect(s.remaining).toBe(665 - 480)
	})
	it('۰۱:۰۶ دیرکرد → ۰ روز کسر', () => {
		const s = personSummary(run([day('1405/06/01', '10:30', '18:00'), day('1405/06/02', '10:20', '18:00'), day('1405/06/03', '10:16', '18:00')]), EMPTY_FILTER, R)
		expect(s.lateTotal).toBe(66)
		expect(s.deductedDays).toBe(0)
		expect(s.remaining).toBe(66)
	})
})

describe('وظیفهٔ حضوری', () => {
	it('وظیفهٔ برگزارشده دیرکرد را می‌بخشد و بخشِ بیرون از حضور اضافه‌کار است', () => {
		// جلسه ۰۹:۰۰ تا ۱۰:۳۰، ورود ۱۰:۴۰ → کلِ ۹۰ دقیقه بیرون از حضور
		const p = run([day('1405/06/19', '10:40', '18:00')], [task('1', '1405/06/19', '09:00', '10:30')])
		const r = p.rows[0]
		expect(r.isLate).toBe(true)
		expect(r.forgivenBy).toBe('meeting')
		expect(r.deductibleLate).toBe(0)
		expect(r.overtime).toBe(90)
		const s = personSummary(p, EMPTY_FILTER, R)
		expect(s.forgivenMin).toBe(40)
		expect(s.deductible).toBe(0)
		expect(s.meetingForgivenCount).toBe(1)
	})
	it('زمانِ نامعتبر → مدت پیش‌فرض ۶۰ دقیقه و علامت‌گذاری', () => {
		const p = run([day('1405/06/19', '10:17', '18:00')], [task('1', '1405/06/19', '19:00', '19:05')])
		const m = p.rows[0].meetings[0]
		expect(m.durSource).toBe('default')
		expect(m.dur).toBe(60)
		expect(m.overtime).toBe(60)
	})
	it('۱۵ دقیقه تا ۴ ساعت = مدتِ واقعی؛ کمتر از ۱۵ یا بیشتر از ۴ ساعت = پیش‌فرض', () => {
		const at = (end: string) => run([day('1405/06/19', '10:00', '18:00')], [task('1', '1405/06/19', '18:00', end)]).rows[0].meetings[0]
		expect(at('18:15').durSource).toBe('task')
		expect(at('18:14').durSource).toBe('default')
		expect(at('22:00').durSource).toBe('task')
		expect(at('22:01').durSource).toBe('default')
	})
	it('وضعیت‌ها: لغو / یادآوری / برگزار نشده جدا شناخته می‌شوند', () => {
		const st = (stage: string, desc: string) => run([day('1405/06/19', '10:17', '18:00')], [task('1', '1405/06/19', '09:00', '10:00', stage, desc)]).rows[0].meetings[0].status
		expect(st('انجام شده', 'مشتری کنسل کرد')).toBe('cancelled')
		expect(st('انجام شده', 'فقط یادآوری بود')).toBe('reminder')
		expect(st('انجام شده', 'مشتری نیامد')).toBe('notheld')
		expect(st('برنامه‌ریزی شده', '')).toBe('notheld')
		expect(st('انجام شده', 'جلسه خوب بود')).toBe('held')
	})
	it('وظیفهٔ لغوشده نه بخشودگی دارد نه اضافه‌کار', () => {
		const p = run([day('1405/06/19', '10:17', '18:00')], [task('1', '1405/06/19', '09:00', '10:00', 'انجام شده', 'جلسه لغو شد')])
		const r = p.rows[0]
		expect(r.lateExcused).toBe(false)
		expect(r.deductibleLate).toBe(17)
		expect(r.overtime).toBe(0)
	})
	it('مرحلهٔ غیرِانجام‌شده = برگزار نشده', () => {
		const p = run([day('1405/06/19', '10:17', '18:00')], [task('1', '1405/06/19', '09:00', '10:00', 'برنامه‌ریزی شده')])
		expect(p.rows[0].lateExcused).toBe(false)
	})
	it('بدونِ فایلِ وظایف اضافه‌کار N/A است (نه صفر)', () => {
		expect(run([day('1405/06/19', '10:00', '18:00')]).rows[0].overtime).toBeNull()
	})
})

describe('ویرایش دستی', () => {
	it('ویرایش ورود و بخشودگی روی همان ردیف اعمال می‌شود', () => {
		const p = run([day('1405/06/19', '10:40', '18:00')], null, { 'شیت|1405/06/19': { entry: '10:10', note: 'تردد ثبت نشد' } })
		expect(p.rows[0].isLate).toBe(false)
		expect(p.rows[0].edited).toBe(true)
		const q = run([day('1405/06/19', '10:40', '18:00')], null, { 'شیت|1405/06/19': { excuse: true } })
		expect(q.rows[0].forgivenBy).toBe('edit')
		expect(lateRows(q, EMPTY_FILTER)[0].cumulative).toBe(0)
	})
})

describe('فایل وظایف', () => {
	const rows = (ids: number[]) => ids.map((id) => ({ 'وظیفه': id, 'برای': 'خانم یاسمن امیری', 'برای ID': 25, 'عنوان': id % 2 ? 'جلسه حضوری' : 'پیگیری', 'تاریخ برنامه‌ریزی': '1405/06/19', 'ساعت برنامه‌ریزی': '11:00:00', 'تاریخ سررسید': '1405/06/19', 'ساعت سررسید': '12:00:00', 'مرحله': 'انجام شده' }))
	it('شناسهٔ تکراری در چند فایل یکی می‌شود', () => {
		const a = parseTaskRows(rows([1, 2, 3]), 'a')!, b = parseTaskRows(rows([3, 4, 5]), 'b')!
		const st = taskStats([a, b], R)
		expect(st.tasks).toBe(5)
		expect(st.employees).toBe(1)
		expect(mergedTasks([a, b]).filter((t) => t.id === '3')).toHaveLength(1)
	})
})

describe('نگاشتِ یاسمن امیری (فاطمه امیری ← خانم یاسمن امیری)', () => {
	const people = ['یاسمن امیری', 'کیمیا نصرت آبادی', 'نورا مقدس', 'محمدرضا محرمی']
	const owners = [{ name: 'خانم یاسمن امیری', pid: '25' }, { name: 'خانم کیمیا نصرت آبادی', pid: '7' }].map((o) => ({ ...o, key: ownerKey(o) }))
	it('شیتِ «یاسمن» با نامِ رسمیِ «فاطمه اميري» ← شخصِ سیستم «یاسمن امیری» (قطعی) ← کاربرِ جولیو ID 25 (قطعی)', () => {
		const l = resolveLink('فاطمه', 'اميري', 'یاسمن', people, owners, undefined)
		expect(l.person).toBe('یاسمن امیری')
		expect(l.personHow).toBe('strong')
		expect(l.owner).toBe('id:25')
		expect(l.ownerHow).toBe('strong')
	})
	it('نگاشتِ دستی بر حدس مقدم است', () => {
		const l = resolveLink('فاطمه', 'اميري', 'یاسمن', people, owners, { person: 'نورا مقدس', owner: 'id:7' })
		expect(l.person).toBe('نورا مقدس')
		expect(l.owner).toBe('id:7')
		expect(l.ownerHow).toBe('manual')
	})
	const real = 'C:/Users/Administrator/Downloads/JOOLIO-Task-1405-07-05-00-22-17-4531edf3.xlsx'
	it.skipIf(!fs.existsSync(real))('فایلِ واقعیِ یاسمن: ۸۲۱ وظیفه · ۱ کارمند · ۱۶ وظیفهٔ بیرون از شرکت', () => {
		const f = parseTaskWorkbook(fs.readFileSync(real).buffer as ArrayBuffer, 'yasaman.xlsx')!
		const st = taskStats([f], R)
		expect(st.tasks).toBe(821)
		expect(st.employees).toBe(1)
		expect(st.outside).toBe(16)
		expect(st.owners[0].key).toBe('id:25')
		void XLSX
	})
})
