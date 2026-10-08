/**
 * C9 — نقاط قوت، نقاط ضعف و پیشنهادِ بهبود بر اساسِ جزوهٔ «مهندسی و مدیریت فروش» آرومین.
 * فقط معیارهای قابل‌سنجش از دفترِ فروش؛ هر مورد مرجعِ جزوه را دارد. نمونهٔ کم = داوری نمی‌شود (بدونِ حدس).
 *  - ۳.۵ چهار فاکتورِ قابلِ اندازه‌گیری: اثربخشی (واجد شرایط)، نرخِ تبدیل (معیار ۲۵٪؛ پایین = ضعف در بستن)، میانگینِ فاکتور (اعتماد به نفس)
 *  - ۴.۱ پارتو ۸۰/۲۰ · ۴.۱/۴.۳ دراکر: در رکودِ تورمی اول سرعتِ فروش و نقدشوندگی، بعد بزرگ‌کردنِ بازار
 *  - ۴.۴ بخشِ ۴۰٪ بازار («الان زمانِ خرید نیست») · پیگیری، نه «گیر دادن» (هری فریدمن)
 */
import { funnelOf, mil, num, pct, fa, type Deal } from '@/engines/commission'
import { funnelDays } from './ledger-analysis'

export type CoachTone = 'strength' | 'weakness' | 'action'
export interface CoachItem { id: string; tone: CoachTone; text: string; ref: string }
export interface CoachInput { deals: Deal[]; teamDeals?: Deal[]; stagnant?: number; follow?: number; today?: string }

const MIN = 5   // کمترین نمونه برای داوریِ نسبت‌ها
const share = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0)
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const cust = (d: Deal) => String(d.name || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s‌]+/g, ' ').trim()

export function coachingFromJozve({ deals, teamDeals, stagnant = 0, follow = 0, today }: CoachInput): CoachItem[] {
	const out: CoachItem[] = []
	const add = (id: string, tone: CoachTone, text: string, ref: string) => out.push({ id, tone, text, ref })
	const by = (k: string) => deals.filter((d) => funnelOf(d) === k)
	const won = by('won'), lost = by('lost'), start = by('start')
	const n = deals.length, beyondStart = n - start.length

	// ۳.۵ اثربخشی: تماس با مشتریِ واجد شرایط
	if (n >= MIN) {
		const q = share(beyondStart, n)
		if (q >= 70) add('qualified', 'strength', `${pct(q)} معاملات از «آغاز» عبور کرده‌اند؛ تماس‌ها با مشتریِ واجد شرایط است.`, 'جزوه ۳.۵ · اثربخشی')
		else if (q < 50) {
			add('qualified', 'weakness', `${pct(100 - q)} معاملات در «آغاز» مانده‌اند؛ فعالیت زیاد است ولی هدفمند نیست.`, 'جزوه ۳.۵ · اثربخشی')
			add('qualify-first', 'action', 'پیش از وقت‌گذاشتن، مشتری را واجد شرایط کنید: نیاز، بودجه و زمانِ خرید را در تماسِ اول بپرسید.', 'جزوه ۳.۵ · اسمارت‌ورک')
		}
	}
	// ۳.۵ نرخِ تبدیل = فروش ÷ واجد شرایط؛ معیارِ جزوه ۲۵٪
	if (beyondStart >= MIN) {
		const c = share(won.length, beyondStart)
		if (c >= 25) add('conversion', 'strength', `نرخ تبدیل ${pct(c)} — هم‌سطح یا بالاتر از معیارِ ۲۵٪ جزوه (۵ فروش از ۲۰ واجد شرایط).`, 'جزوه ۳.۵ · نرخ تبدیل')
		else if (c < 15) {
			add('conversion', 'weakness', `نرخ تبدیل ${pct(c)}؛ طبق جزوه نرخِ پایین یعنی ضعف در بستنِ قرارداد (Closing).`, 'جزوه ۳.۵ · نرخ تبدیل')
			add('closing', 'action', 'تمرینِ بستن: در جلسهٔ هفتگیِ شنبه دو معاملهٔ شکست‌خورده را مرور و جملهٔ بستن را تمرین کنید.', 'جزوه ۳.۶ · جلسهٔ هفتگی')
		}
	}
	// ۳.۵ عزت نفس = میانگینِ مبلغِ فاکتور (فقط وقتی تیمی برای مقایسه هست)
	const wonAmt = won.map((d) => num(d.amount)).filter((v) => v > 0)
	const teamWon = (teamDeals || []).filter((d) => funnelOf(d) === 'won').map((d) => num(d.amount)).filter((v) => v > 0)
	if (wonAmt.length >= 3 && teamWon.length > wonAmt.length) {
		const mine = avg(wonAmt), team = avg(teamWon)
		if (mine >= team * 1.2) add('ticket', 'strength', `میانگینِ فاکتور ${mil(mine)} در برابرِ ${mil(team)} تیم؛ اعتماد به نفس در پیشنهادِ محصولِ باارزش‌تر.`, 'جزوه ۳.۵ · میانگین فاکتور')
		else if (mine <= team * 0.7) {
			add('ticket', 'weakness', `میانگینِ فاکتور ${mil(mine)}، کمتر از ${mil(team)} تیم.`, 'جزوه ۳.۵ · میانگین فاکتور')
			add('upsell', 'action', 'در هر پیشنهاد یک گزینهٔ کامل‌تر (ماژول یا بستهٔ بالاتر) هم ارائه کنید.', 'جزوه ۳.۵ · عزت نفس')
		}
	}
	// ۴.۱ پارتو: سهمِ ۲۰٪ مشتریانِ برتر از فروش
	const byCust = new Map<string, number>()
	for (const d of won) { const k = cust(d); if (k) byCust.set(k, (byCust.get(k) || 0) + num(d.amount)) }
	if (byCust.size >= MIN) {
		const vals = [...byCust.values()].sort((a, b) => b - a), total = vals.reduce((s, v) => s + v, 0)
		const top = share(vals.slice(0, Math.max(1, Math.round(vals.length * 0.2))).reduce((s, v) => s + v, 0), total)
		if (top >= 80) {
			add('pareto', 'weakness', `${pct(top)} فروش از ۲۰٪ مشتریان است؛ وابستگیِ زیاد به چند مشتری.`, 'جزوه ۴.۱ · پارتو')
			add('market', 'action', 'بازار را بزرگ‌تر کنید: مشتریانِ هم‌صنفِ مشتریانِ برتر را هدف بگیرید.', 'جزوه ۴.۱.۲ · دراکر')
		} else if (top <= 60) add('pareto', 'strength', `فروش پخش است (۲۰٪ مشتریانِ برتر = ${pct(top)})؛ ریسکِ وابستگی کم است.`, 'جزوه ۴.۱ · پارتو')
	}
	// ۴.۳ دراکر در رکودِ تورمی: سرعتِ فروش اولویتِ اول
	const days = won.map((d) => funnelDays(d, today)).filter((x): x is number => x !== null)
	if (days.length >= 3) {
		const a = Math.round(avg(days))
		if (a <= 30) add('speed', 'strength', `چرخهٔ فروش به‌طور میانگین ${fa(a)} روز؛ سرعت، اولویتِ اول در رکودِ تورمی.`, 'جزوه ۴.۳.۱ · فروش سریع')
		else if (a > 60) add('speed', 'weakness', `چرخهٔ فروش به‌طور میانگین ${fa(a)} روز؛ کُند است.`, 'جزوه ۴.۳.۱ · فروش سریع')
	}
	if (stagnant > 0) {
		add('stagnant', 'weakness', `${fa(stagnant)} معامله بیش از ۴۰ روز بی‌حرکت مانده است.`, 'جزوه ۴.۳.۱ · فروش سریع')
		add('chunk', 'action', 'برای معاملاتِ متوقف پیشنهادِ کوچک‌تر یا مرحله‌ای بدهید (خُرد کردن) تا سریع‌تر به نقد برسند.', 'جزوه ۴.۳.۱ · خرد کردن')
	}
	// پیگیری، نه «گیر دادن» — «ممنون، برمی‌گردم» (هری فریدمن)
	if (follow > 0) {
		add('follow', 'weakness', `${fa(follow)} پیگیریِ تکمیل‌نشده؛ مشتریِ «برمی‌گردم» بدونِ پیگیری برنمی‌گردد.`, 'جزوه · اهمیت پیگیری')
		add('follow-plan', 'action', 'برای هر معاملهٔ باز تاریخِ پیگیریِ بعدی و دلیلِ تماس ثبت کنید؛ پیگیری مهارت است، نه گیر دادن.', 'جزوه · پیگیری در برابر گیر دادن')
	}
	// دراکر: بزرگ‌کردنِ بازار (مشتریِ جدید) در برابرِ تکرارِ خرید
	if (won.length >= MIN) {
		const nw = share(won.filter((d) => d.kind !== 'repeat').length, won.length)
		if (nw >= 50) add('new', 'strength', `${pct(nw)} فروش از مشتریِ جدید است؛ بازار در حالِ بزرگ‌شدن است.`, 'جزوه ۴.۱.۲ · دراکر')
		else if (nw <= 20) {
			add('repeat', 'strength', `${pct(100 - nw)} فروش تکرارِ خرید است؛ وفاداریِ مشتری خوب است.`, 'جزوه ۴.۱.۲ · دراکر')
			add('prospect', 'action', 'قانونِ قورباغه: از هر مشتریِ وفادار و هر سرنخ دستِ‌کم یک معرفی بخواهید تا بازار بزرگ‌تر شود.', 'جزوه ۷.۳ · شبکه‌سازی')
		}
	}
	// ۴.۴ شکست‌ها: بخشِ ۴۰٪ «الان زمانِ خرید نیست»
	if (won.length + lost.length >= MIN && share(lost.length, won.length + lost.length) >= 50) {
		const reasons = new Map<string, number>()
		for (const d of lost) { const r = String(d.lossReason || '').trim(); if (r) reasons.set(r, (reasons.get(r) || 0) + 1) }
		const topR = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]
		add('lost', 'weakness', `${pct(share(lost.length, won.length + lost.length))} معاملاتِ نهایی‌شده شکست خورده‌اند${topR ? ` (بیشترین دلیل: «${topR[0]}»)` : ''}.`, 'جزوه ۴.۴ · تقسیم‌بندی مشتریان')
		add('revive', 'action', 'شکست‌خورده‌های «الان وقتش نیست» همان ۴۰٪ بازارند؛ با پیشنهاد و متقاعدسازیِ تازه دوباره سراغشان بروید.', 'جزوه ۴.۴ · متقاعدسازی')
	}
	// نقدشوندگی در رکودِ تورمی
	const wonTotal = won.reduce((s, d) => s + num(d.amount), 0)
	if (won.length >= MIN && wonTotal > 0) {
		const cash = share(won.filter((d) => (d.settle || 'cash') === 'cash').reduce((s, d) => s + num(d.amount), 0), wonTotal)
		if (cash >= 70) add('cash', 'strength', `${pct(cash)} فروش نقدی است؛ نقدشوندگی بالا.`, 'جزوه ۴.۳.۱ · تمرکز بر نقدینگی')
		else if (cash < 40) add('cash', 'weakness', `فقط ${pct(cash)} فروش نقدی است؛ چک و معلق نقدینگی را کُند می‌کند.`, 'جزوه ۴.۳.۱ · تمرکز بر نقدینگی')
	}
	return out
}
