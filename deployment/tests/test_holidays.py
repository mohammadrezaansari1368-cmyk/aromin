"""Synthetic proofs for automatic official holidays."""
import unittest
from datetime import date, timedelta
from aromin_stage import _jalali
from aromin_holidays import (SOLAR, LUNAR, hijri_to_gregorian, official_holidays,
                             official_holidays_named, effective_holidays_named)
import aromin_performance as perf


def jalali(g):
    return '%04d/%02d/%02d' % _jalali(g.year,g.month,g.day)


class Holidays(unittest.TestCase):
    def test_solar_1405(self):
        holidays = official_holidays('1405/01/01','1405/12/29')
        self.assertTrue({'1405/'+md for md in SOLAR} <= holidays)
        self.assertNotIn('1403/12/30',official_holidays('1403/12/30','1403/12/30'))

    def test_lunar_once_per_hijri_year(self):
        for year in range(1446,1450):
            start = jalali(hijri_to_gregorian(year,1,1))
            end = jalali(hijri_to_gregorian(year+1,1,1)-timedelta(days=1))
            holidays = official_holidays_named(start,end)
            for month,day,name in LUNAR:
                self.assertEqual(sum(name in names.split(' / ') for names in holidays.values()),1,(year,name))
                g = (hijri_to_gregorian(year,month+1,1)-timedelta(days=1)
                     if day == 0 else hijri_to_gregorian(year,month,day))
                self.assertIn(name,holidays[jalali(g)])

    def test_anchors(self):
        for y,m,d,anchor in [(1447,10,1,date(2026,3,20)),(1448,1,10,date(2026,6,26))]:
            actual = hijri_to_gregorian(y,m,d)
            self.assertLessEqual(abs((actual-anchor).days),1)

    def test_adjustments_and_extras(self):
        cfg = {'holidayAdjust':{'1405/01/01':'1405/02/05','1405/01/02':None},
               'extraHolidays':['1405/02/06'],'holidays':['1405/02/07']}
        result = effective_holidays_named('1405/01/01','1405/02/31',cfg)
        self.assertNotIn('1405/01/01',result)
        self.assertNotIn('1405/01/02',result)
        self.assertTrue({'1405/02/05','1405/02/06','1405/02/07'} <= result.keys())
        self.assertIn('1405/02/05',effective_holidays_named('1405/02/01','1405/02/31',cfg))
        self.assertIn('1405/01/02',effective_holidays_named('1405/01/01','1405/01/31',cfg,['1405/01/02']))

    def test_farvardin_and_partial_month(self):
        full = {'fy':'1405','targets':{'1':[310]*12},'perf':{}}
        person = {'id':'1'}
        holidays = official_holidays('1405/01/01','1405/01/31')
        solar = {'1405/'+md for md in SOLAR}
        lunar = holidays-solar
        self.assertIn('1405/01/24',lunar) # 25 Shawwal adds a working-day closure
        self.assertEqual(perf.sales_targets(full,person,'1405/01/01','1405/01/31',{},[],[])['workingDays'],len(perf.calendar_days('1405/01/01','1405/01/31',holidays)))
        for day in lunar:
            self.assertNotIn(day,perf.calendar_days('1405/01/01','1405/01/31',holidays))
        # A closure outside the selected interval must still affect the monthly denominator.
        full['perf'] = {'extraHolidays':['1405/07/20']}
        t = perf.sales_targets(full,person,'1405/07/01','1405/07/05',{},[],[])
        h = effective_holidays_named('1405/07/01','1405/07/30',full['perf'])
        self.assertAlmostEqual(t['amount'],310*len(perf.calendar_days('1405/07/01','1405/07/05',h))/len(perf.calendar_days('1405/07/01','1405/07/30',h)))
