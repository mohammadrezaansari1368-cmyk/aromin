import { describe, expect, it } from 'vitest'
import { projectTicketRows } from './ticketsApi'

describe('projectTicketRows', () => {
	it('keeps only the columns the server may read; history and descriptions never leave the browser', () => {
		const row = { 'شماره تیکت': 101, 'تاریخ ثبت': '1405/01/02 10:00', 'كارشناس': 'الف', 'تأخیر SLA': 'عدم تاخیر', 'تاخیر OLA': 'تاخیر', 'سرشاخه': 'تلفنی', 'موضوع اصلی': 'نصب', 'وضعیت': 'بسته', 'شرکت': 'ب', 'تاریخچه': 'x'.repeat(500), 'توضیحات': 'y' }
		expect(Object.keys(projectTicketRows([row])[0]).sort()).toEqual(['شماره تیکت', 'تاریخ ثبت', 'كارشناس', 'تأخیر SLA', 'تاخیر OLA', 'سرشاخه', 'موضوع اصلی', 'وضعیت', 'شرکت'].sort())
	})
})
