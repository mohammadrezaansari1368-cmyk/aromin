# دستیارِ عامل (Agent) — نقشهٔ فایل‌ها و سیم‌کشی

| فایل | کار |
|---|---|
| `SmartAssistant3D.tsx` | دکمهٔ سه‌بعدی (React Three Fiber + drei `ContactShadows`)؛ نگاه با موس (فنر)، رنگِ تم با lerp، واکنش به وضعیت |
| `createAssistant.ts` | مدلِ رویه‌ایِ img2threejs (کره + دو چشمِ کپسولی) — تولیدشده از `agent3d/object-sculpt-spec.json`، دستی ویرایش نشود |
| `AgentDock.tsx` | پنلِ گفت‌وگو + صدا (SpeechRecognition / speechSynthesis)، کارتِ تأییدِ نوشتن، دکمه‌های اقدامِ صفحه |
| `AgentPreview.tsx` | فقط بازبینی: `?agent-preview` (`&stripped` · `&albedo&bg=808080` · `&view=three-quarter` · `&glb`) |
| `src/lib/agent.ts` | حالت، تعریفِ ابزارها، کنترلِ نقش، حلقهٔ مدل↔ابزار، نمایشِ تدریجی، گفتار |
| `public/models/aromin-agent.glb` | خروجیِ GLB (GLTFExporter؛ مواد `body-gloss` / `eye-light`) برای استفادهٔ بیرونی — اپ از آن استفاده نمی‌کند |

## جریان
1. پیام → `POST /api/ai {mode:'agent', messages, role, tabs, page, context}`
2. سرور (`server.py → _agent_turn`) فهرستِ ابزارِ مجاز را بر اساسِ نقش در پرامپت می‌گذارد؛ مدل برای ابزار می‌نویسد:
   ```` ```tool {"name":"navigateToTab","args":{"tab":"p-set"}} ``` ````
3. کلاینت (`runTool`) ابزار را اجرا می‌کند و نتیجه را به‌صورتِ `[tool_result name] {...}` برمی‌گرداند (حداکثر ۳ دور).

## ابزارها
| ابزار | نقش | اجرا |
|---|---|---|
| `navigateToTab(tab)` | همه | `AppShell.go(id)` (همان ذخیرهٔ فوری/بارگذاریِ موتور) |
| `fetchAnalytics(metric)` | مدیر | `fetchFull()` + `compute()` از `lib/data.ts` — فقط خواندنی |
| `updateAppTheme({theme, mode})` | مدیر | `setTheme()` — فقط همین مرورگر |
| `toggleFeature(feature, enabled)` | مدیر | `voiceReplies`, `agentMotion` در `localStorage['aromin.ui.features']` |
| `updateDatabaseRecord(collection,id,data)` | مدیر | فیلدهای سفیدفهرست (`people`: mobile/email/level، `users`: role/mobile/email) → کارتِ تأیید → `flush()` موتور → `saveState(..., {forceBackup:true})` → `reload()` |

## افزودنِ ابزارِ تازه
1. به `TOOLS` در `lib/agent.ts` اضافه کن (`admin: true` اگر فقط مدیر) و در `runTool` پیاده‌سازی کن.
2. همان نام و توضیح را به `AGENT_TOOLS` در `server.py` بده (ستونِ نقش: `"all"` یا `"manager"`).
3. نوشتن در داده فقط از `saveState` با `forceBackup` و بعد از `askConfirm`؛ کلیدِ تازه در بلاب نساز (اپِ قدیمی آن را پاک می‌کند) — جدولِ جدا روی سرور بساز.

## اقدام‌های صفحه
هر تب می‌تواند `setPageContext(() => خلاصه)` و `setPageActions([{label, run}])` بدهد (مثل G: تحلیل/استراتژی/ریسک) و در unmount پاکشان کند.

## ⚠️ امنیت
کنترلِ نقش در کلاینت و پرامپتِ سرور است، ولی `/api/state` هنوز احرازِ هویت ندارد؛ امنیتِ واقعی = احرازِ نشست و بررسیِ نقش روی سرور.
