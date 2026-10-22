/**
 * «راهنمای ساده» (3.9.72) بالای هر تب: یک شکلک، یک جملهٔ کوتاه، سه قدم و یک جمله برای یاد دادن به نفرِ بعد —
 * آن‌قدر ساده که یک بچهٔ ۷ ساله بفهمد و بتواند به بچهٔ دیگری توضیح بدهد. «فهمیدم» آن را برای همان تب جمع می‌کند (فقط در همین مرورگر).
 */
import { useEffect, useState } from 'react'
import BlurText from '@/components/ui/BlurText'

type Guide = { icon: string; title: string; say: string; steps: [string, string, string]; teach: string }
export const GUIDES: Record<string, Guide> = {
	dashboard: { icon: '🏠', title: 'خانه', say: 'اینجا می‌بینی امروز کارها چطور پیش رفته.', steps: ['عددهای بزرگ را نگاه کن', 'سبز یعنی خوب، قرمز یعنی کمک لازم است', 'روی هر کاشی بزن تا بیشتر ببینی'], teach: 'بگو: «این صفحه مثلِ کارنامهٔ امروزِ ماست.»' },
	'p-dash': { icon: '📊', title: 'تحلیل مدیریتی', say: 'نمودارها نشان می‌دهند کجا رشد کردیم.', steps: ['ماه را انتخاب کن', 'ستون‌های بلندتر یعنی فروشِ بیشتر', 'روی ستون نگه دار تا عددش را ببینی'], teach: 'بگو: «ستونِ بلند یعنی آن ماه بیشتر فروختیم.»' },
	'p-inv': { icon: '📒', title: 'دفتر فروش', say: 'هر فروش یک خط در این دفتر است.', steps: ['دنبالِ اسمِ مشتری بگرد', 'روی خط بزن تا جزئیات باز شود', 'اگر چیزی اشتباه است، ویرایش کن'], teach: 'بگو: «هر چیزی فروختیم اینجا نوشته می‌شود، مثلِ دفترِ مشق.»' },
	'p-team': { icon: '🎁', title: 'پورسانت', say: 'اینجا معلوم می‌شود هر کس چقدر پاداش می‌گیرد.', steps: ['ماه را انتخاب کن', 'اسمِ هر نفر و پاداشش را ببین', 'وقتی درست بود، تأیید کن'], teach: 'بگو: «هر کس بیشتر کمک کرد، پاداشِ بیشتری می‌گیرد.»' },
	performance: { icon: '⭐', title: 'عملکرد', say: 'می‌بینی هر نفر چقدر خوب کار کرده.', steps: ['اسمِ یک نفر را بزن', 'ستاره‌ها و عددهایش را ببین', 'حضور و غیاب خودش از هاریکان می‌آید'], teach: 'بگو: «اینجا مثلِ تابلوی ستاره‌های کلاس است.»' },
	'p-ticket': { icon: '🎫', title: 'پشتیبانی', say: 'هر مشکلِ مشتری یک برگه است تا حل شود.', steps: ['برگه‌های باز را ببین', 'یکی را بردار و حلش کن', 'وقتی حل شد، ببندش'], teach: 'بگو: «هر برگه یک مشتری است که منتظرِ کمکِ ماست.»' },
	forecast: { icon: '🔮', title: 'پیش‌بینی', say: 'حدس می‌زنیم ماه‌های بعد چقدر می‌فروشیم.', steps: ['هدفِ سال را ببین', 'ماه‌های رفته و مانده را مقایسه کن', 'اگر عقبیم، برنامه را عوض کن'], teach: 'بگو: «مثلِ این است که بگوییم تا آخرِ سال چند تا ستاره جمع می‌کنیم.»' },
	instagram: { icon: '📸', title: 'اینستاگرام', say: 'می‌بینی پیجت چطور است و به پیام‌ها جواب می‌دهی.', steps: ['دکمهٔ تحلیلِ زنده را بزن', 'ریل‌های خوب و پیام‌ها را ببین', 'جواب را بخوان و ارسال را بزن'], teach: 'بگو: «داشبورد پیام‌ها را می‌خواند و جواب پیشنهاد می‌دهد، ما فقط تأیید می‌کنیم.»' },
	council: { icon: '🪑', title: 'اتاق شورا', say: 'از چند استادِ مجازی نظر می‌گیری.', steps: ['سؤالت را بنویس', 'صندلی‌ها را انتخاب کن', 'گوش بده و رأیِ آخر را بخوان'], teach: 'بگو: «چند نفرِ دانا دورِ میز با هم فکر می‌کنند.»' },
	'p-ladder': { icon: '🪜', title: 'نردبان پیشرفت', say: 'هر پله یعنی یک قدم جلوتر رفتن.', steps: ['پلهٔ فعلیِ هر نفر را ببین', 'ببین برای پلهٔ بعد چه لازم است', 'به او کمک کن بالا برود'], teach: 'بگو: «هر کار خوب ما را یک پله بالاتر می‌برد.»' },
	import: { icon: '📥', title: 'ایمپورت', say: 'فایل‌ها را اینجا می‌دهی تا داشبورد بخواندشان.', steps: ['فایلِ اکسل را بکش و رها کن', 'صبر کن تا بررسی شود', 'خطاها را درست کن و دوباره بفرست'], teach: 'بگو: «فایل را به داشبورد می‌دهیم تا بخواند، مثلِ دادنِ کتاب به دوستمان.»' },
	'p-report': { icon: '🗂️', title: 'گزارش', say: 'گزارش می‌گیری و از همه‌چیز نسخهٔ پشتیبان داری.', steps: ['نوعِ گزارش را انتخاب کن', 'دانلود را بزن', 'نسخهٔ پشتیبان را جای امن نگه دار'], teach: 'بگو: «پشتیبان مثلِ کپیِ نقاشی است که اگر گم شد، داریمش.»' },
	'p-calc': { icon: '🧮', title: 'ماشین‌حساب', say: 'حساب‌های فروش را سریع انجام می‌دهی.', steps: ['عددها را بنویس', 'نتیجه را ببین', 'اگر لازم شد، عوضشان کن'], teach: 'بگو: «ماشین‌حساب جمع و تفریق را برایمان انجام می‌دهد.»' },
	'p-hire': { icon: '🤝', title: 'استخدام', say: 'آدم‌های تازه را پیدا و انتخاب می‌کنی.', steps: ['داوطلب را اضافه کن', 'آزمون‌ها را ببین', 'بهترین را انتخاب کن'], teach: 'بگو: «دنبالِ یک هم‌تیمیِ خوب می‌گردیم.»' },
	'p-set': { icon: '⚙️', title: 'تنظیمات', say: 'اینجا داشبورد را برای خودت تنظیم می‌کنی.', steps: ['کارتِ مورد نظر را پیدا کن', 'تغییر را بده', 'ذخیره را بزن'], teach: 'بگو: «مثلِ چیدنِ اتاقمان، هر چیز را سرِ جایش می‌گذاریم.»' },
}

const KEY = 'aromin.kidguide.hidden'
const readHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }

export default function KidGuide({ tab }: { tab: string }) {
	const g = GUIDES[tab]
	const [hidden, setHidden] = useState<string[]>(readHidden)
	const [teach, setTeach] = useState(false)
	useEffect(() => { setTeach(false) }, [tab])
	if (!g) return null
	const save = (v: string[]) => { setHidden(v); try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode */ } }
	if (hidden.includes(tab)) {
		return <button type="button" className="mb-3 rounded-full bg-muted px-3 py-1 text-[12px] text-muted-foreground" onClick={() => save(hidden.filter((x) => x !== tab))}>{g.icon} راهنمای ساده</button>
	}
	return (
		<section dir="rtl" className="mb-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-inset ring-border/60" data-testid="kid-guide" aria-label={'راهنمای ساده: ' + g.title}>
			<div className="flex items-start gap-3">
				<span className="text-[34px] leading-none" aria-hidden="true">{g.icon}</span>
				<div className="min-w-0 flex-1">
					<BlurText key={tab} text={g.say} trigger="load" delay={90} className="text-[17px] font-semibold leading-8 text-foreground" />
					<ol className="mt-2 flex flex-wrap gap-2">{g.steps.map((s, i) => (
						<li key={i} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[13px]"><b className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{'۱۲۳'[i]}</b>{s}</li>
					))}</ol>
					{teach && <p className="mt-2 rounded-xl bg-accent/15 px-3 py-2 text-[13.5px]" role="status">🗣️ {g.teach}</p>}
				</div>
			</div>
			<div className="mt-3 flex gap-2">
				<button type="button" className="rounded-full bg-primary px-4 py-1.5 text-[13px] font-semibold text-primary-foreground" onClick={() => setTeach((v) => !v)}>به دوستت یاد بده</button>
				<button type="button" className="rounded-full bg-muted px-4 py-1.5 text-[13px]" onClick={() => save([...hidden, tab])}>فهمیدم</button>
			</div>
		</section>
	)
}
