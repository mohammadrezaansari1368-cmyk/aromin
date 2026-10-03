"""Optional specialist host using the SAME AROMIN runtime, tools and security."""

from contextlib import asynccontextmanager
from typing import Annotated

import uvicorn
from fastapi import Depends

from app.agent.profile import AgentProfile
from app.api.deps import require
from app.core.config import Settings
from app.core.container import build_container
from app.core.logging import configure_logging
from app.main import create_app as core_app
from app.security.auth import Principal
from app.security.permissions import Permission
from app.tools.builtin import BUILTIN_TOOL_NAMES

SPECIALIST_PROFILE = AgentProfile(
    name="aromin-companion",
    version=1,
    allowed_tools=BUILTIN_TOOL_NAMES,
    system_prompt=(
        "تو آرو، دستیار تخصصی آرومین هستی. فارسی روشن، دقیق و کاربردی صحبت کن. "
        "در توضیح قابلیت‌ها، حل مسئله و راهنمایی فنی آرومین کمک کن؛ اگر اطلاعات محصول یا قیمت تأییدشده نداری صریح بگو. "
        "سیستم مستقل aromin-agent با Python/FastAPI/SQLAlchemy ساخته شده است. Phase 3 موتور وظایف ماندگار "
        "PostgreSQL است؛ Redis فقط هماهنگی و محدودسازی درخواست است. Phase 3 هنوز کامل نیست. "
        "Cloud Assistant v3.9.38 و MariaDB سامانه جداگانه‌اند. بدون شواهد ادعای اجرا، تست، انتشار یا تکمیل نکن. "
        "مجوز، تأیید و سیاست ابزارها را رعایت کن؛ هیچ انتشار مستقیم تلگرام یا اقدام واقعی تجاری مجاز نیست. "
        "دانش سازمانی، قیمت‌ها، فایل‌های مشتری و RAG در این نسخه بارگذاری نشده‌اند؛ آن‌ها را اختراع نکن. "
        "برای پاسخ تخصصی، مسئله را مشخص کن، راهکار عملی بده و محدودیت را کوتاه توضیح بده."
    ),
)


def create_app():
    container = build_container(Settings(), profile=SPECIALIST_PROFILE)
    configure_logging(container.settings.log_level, container.settings.log_format.value)
    app = core_app(container=container)
    core_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(app):
        try:
            async with core_lifespan(app):
                yield
        finally:
            await container.aclose()

    app.router.lifespan_context = lifespan

    @app.get("/companion/info")
    async def info(_: Annotated[Principal, Depends(require(Permission.chat_write))]):
        return {"provider": container.provider.name, "profile": SPECIALIST_PROFILE.name}

    return app


if __name__ == "__main__":
    uvicorn.run("app.companion.agent:create_app", factory=True, host="127.0.0.1", port=8001)
