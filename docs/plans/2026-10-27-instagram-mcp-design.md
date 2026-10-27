# Instagram MCP — طرحِ مرحلهٔ بعد

داشبورد فعلاً از REST پروژهٔ Composio استفاده می‌کند؛ MCP client در این تغییر پیاده‌سازی نمی‌شود. اتصال‌های Consumer و Developer project مشترک نیستند. Instagram به حساب Business/Creator متصل به Facebook Page نیاز دارد.

دو مسیر ممکن:
- Consumer MCP: `https://connect.composio.dev/mcp` با header `x-consumer-api-key` از env `COMPOSIO_CONSUMER_KEY` (نوع `ck_…`). این کلید تمام برنامه‌های متصلِ کاربر را در دسترس می‌گذارد؛ برای عامل محدود به Instagram پیشنهاد نمی‌شود.
- Project/session MCP: `https://backend.composio.dev/api/v3.1/mcp/...` با `x-api-key` از Project key نوع `ak_…` و `user_id` مشخص. پیشنهاد: session با `toolkits: ["instagram"]` و allowlist ابزارهای `INSTAGRAM_*`؛ هویت کاربر و tenant در سرور تعیین شود.

در مرحلهٔ بعد، MCP client با JSON-RPC روی streamable HTTP و `urllib`، بدون dependency جدید ساخته شود؛ مدیریت session، پاسخ JSON/SSE، deadline و خطاهای بدون اطلاعات حساس لازم است. ابزارهای کشف‌شده پیش از اجرا با allowlist تطبیق داده شوند. پاسخ‌ها همچنان نیازمند تأیید انسان هستند و ارسال فقط از مسیر موجود `ig_reply` انجام می‌شود؛ عامل مجوز ارسال مستقیم ندارد. کلیدها فقط در محیط سرور نگهداری شوند.
