import { describe, expect, it } from 'vitest'
import { projectTicketRows } from './ticketsApi'

describe('projectTicketRows', () => {
	it('keeps only the columns the server may read; history and descriptions never leave the browser', () => {
		const row = { 'شماره تیکت': 101, 'تاریخ ثبت': '1405/01/02 10:00', 'كارشناس': 'الف', 'تأخیر SLA': 'عدم تاخیر', 'تاخیر OLA': 'تاخیر', 'سرشاخه': 'تلفنی', 'موضوع اصلی': 'نصب', 'وضعیت': 'بسته', 'شرکت': 'ب', 'تاریخچه': 'x'.repeat(500), 'توضیحات': 'y' }
		expect(Object.keys(projectTicketRows([row])[0]).sort()).toEqual(['شماره تیکت', 'تاریخ ثبت', 'كارشناس', 'تأخیر SLA', 'تاخیر OLA', 'سرشاخه', 'موضوع اصلی', 'وضعیت', 'شرکت'].sort())
	})
	it('never takes a description as the ticket number when no exact number column exists (review PR11-R03)', () => {
		const row = { 'شرح تیکت': '12345', 'توضیحات تیکت': 'x', 'تاریخ ثبت': '1405/01/02', 'کارشناس': 'الف' }
		expect(Object.keys(projectTicketRows([row])[0]).sort()).toEqual(['تاریخ ثبت', 'کارشناس'].sort())
	})
	it('drops descriptive columns that merely contain a kept word (review PR11-004)', () => {
		const row = { 'تیکت': 7, 'تاریخ ثبت': '1405/01/02', 'کارشناس': 'الف', 'وضعیت': 'باز', 'توضیحات تیکت': 'secret', 'تاریخچه تغییر وضعیت': 'h', 'عنوان موضوع': 't', 'نحوه ثبت تیکت': 'n' }
		expect(Object.keys(projectTicketRows([row])[0]).sort()).toEqual(['تیکت', 'تاریخ ثبت', 'کارشناس', 'وضعیت'].sort())
	})
})
