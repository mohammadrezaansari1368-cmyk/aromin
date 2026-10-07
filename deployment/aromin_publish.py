"""Deterministic publishing policy and composition. No server or network imports."""
import copy
import datetime as dt
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import re
import socket
import urllib.error

try:
    from zoneinfo import ZoneInfo
    TEHRAN = ZoneInfo("Asia/Tehran")
except (ImportError, KeyError):
    TEHRAN = dt.timezone(dt.timedelta(hours=3, minutes=30))
UTC = dt.timezone.utc
DESTINATIONS = ("telegram", "bale", "instagram_story", "whatsapp_channel")
DEFAULTS = dict(enabled=False, preparation_time=None, publishing_time=None,
                destinations=[], approval_mode="manual", late_approval_policy="defer",
                rotation=dict(cooldown_days=30, exclude_urls=[], exclude_keywords=[],
                              priority_urls=[], require_in_stock=True),
                story_show_price=False, price_max_age_minutes=60,
                cost_limits=dict(max_ai_calls_per_run=2, max_product_fetches_per_run=15,
                                 max_image_api_calls_per_run=0))
IG_CREATE = "INSTAGRAM_POST_IG_USER_MEDIA"
IG_PUBLISH = "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH"
IG_CREATE_FIELDS = ("ig_user_id", "image_url", "media_type")
IG_PUBLISH_FIELDS = ("ig_user_id", "creation_id", "max_wait_seconds")
WHATSAPP_BLOCK = "no verified WhatsApp Channels API"
EN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      default=lambda v: v.isoformat() if isinstance(v, (dt.date, dt.datetime)) else str(v))


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def settings(value=None, env=None):
    result = copy.deepcopy(DEFAULTS)
    value = value or {}
    if not isinstance(value, dict) or set(value) - set(result):
        raise ValueError("unknown settings")
    for key, val in value.items():
        if isinstance(result[key], dict):
            if not isinstance(val, dict) or set(val) - set(result[key]):
                raise ValueError("invalid " + key)
            result[key].update(val)
        else:
            result[key] = val
    for key in ("enabled", "story_show_price"):
        if type(result[key]) is not bool:
            raise ValueError("invalid " + key)
    for key in ("preparation_time", "publishing_time"):
        if result[key] is not None and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", str(result[key])):
            raise ValueError("invalid " + key)
    if result["approval_mode"] not in ("manual", "automatic") or result["late_approval_policy"] not in ("defer", "immediate"):
        raise ValueError("invalid approval policy")
    dest = result["destinations"]
    if not isinstance(dest, list) or any(d not in DESTINATIONS for d in dest) or len(set(dest)) != len(dest):
        raise ValueError("invalid destinations")
    limits = result["cost_limits"]
    for key, low, high in (("max_ai_calls_per_run", 1, 2), ("max_product_fetches_per_run", 1, 15), ("max_image_api_calls_per_run", 0, 0)):
        if type(limits[key]) is not int or not low <= limits[key] <= high:
            raise ValueError("invalid cost limit")
    rotation = result["rotation"]
    if type(rotation["cooldown_days"]) is not int or not 0 <= rotation["cooldown_days"] <= 3650 or type(rotation["require_in_stock"]) is not bool:
        raise ValueError("invalid rotation")
    for key in ("exclude_urls", "exclude_keywords", "priority_urls"):
        if not isinstance(rotation[key], list) or any(not isinstance(x, str) or len(x) > 2000 for x in rotation[key]):
            raise ValueError("invalid rotation list")
    if type(result["price_max_age_minutes"]) is not int or not 1 <= result["price_max_age_minutes"] <= 1440:
        raise ValueError("invalid price age")
    if result["enabled"]:
        if not result["publishing_time"] or not result["preparation_time"] or result["preparation_time"] >= result["publishing_time"] or not dest:
            raise ValueError("preparation must precede publishing; destinations required")
        env = env or {}
        required = {"telegram": ("COMPOSIO_API_KEY", "COMPOSIO_TG_ACCOUNT", "TELEGRAM_CHANNEL", "TELEGRAM_ADMIN_ID"),
                    "bale": ("BALE_BOT_TOKEN", "BALE_CHANNEL_ID"),
                    "instagram_story": ("COMPOSIO_API_KEY", "COMPOSIO_IG_ACCOUNT", "INSTAGRAM_IG_USER_ID")}
        for d in dest:
            if any(not env.get(k) for k in required.get(d, ())):
                raise ValueError("destination configuration missing: " + d)
        if "instagram_story" in dest and not (env.get("COMPOSIO_IG_USER_ID") or env.get("COMPOSIO_USER_ID")):
            raise ValueError("destination configuration missing: instagram_story user")
        if result["approval_mode"] == "manual" and any(not env.get(k) for k in ("COMPOSIO_API_KEY", "COMPOSIO_TG_ACCOUNT", "TELEGRAM_ADMIN_ID")):
            raise ValueError("manual preview configuration missing")
    elif result["preparation_time"] and result["publishing_time"] and result["preparation_time"] >= result["publishing_time"]:
        raise ValueError("preparation must precede publishing")
    return result


def slot_time(day, hhmm):
    hour, minute = map(int, hhmm.split(":"))
    return dt.datetime.combine(day, dt.time(hour, minute), TEHRAN).astimezone(UTC).replace(tzinfo=None)


def daily_slot(now, config):
    if not config["enabled"]:
        return None
    local = now.replace(tzinfo=UTC).astimezone(TEHRAN) if now.tzinfo is None else now.astimezone(TEHRAN)
    utc = local.astimezone(UTC).replace(tzinfo=None)
    day = local.date()
    if slot_time(day, config["preparation_time"]) <= utc < slot_time(day, config["publishing_time"]):
        return day, slot_time(day, config["publishing_time"])
    return None


def candidates(urls, rotation, recent):
    return [u for u in dict.fromkeys(rotation["priority_urls"] + sorted(urls))
            if u not in recent and u not in rotation["exclude_urls"]]


def eligible(product, rotation):
    if not product or any(not product.get(k) for k in ("name", "image", "description")):
        return False
    availability = product.get("availability")
    if rotation["require_in_stock"] and availability and availability != "InStock":
        return False
    hay = " ".join(str(product.get(k) or "") for k in ("name", "title", "description")).casefold()
    return not any(k.casefold() in hay for k in rotation["exclude_keywords"])


def fingerprint(product, show_price=False):
    fields = ("name", "title", "description", "brand", "image", "availability")
    source = {k: product.get(k) for k in fields}
    if show_price:
        source.update({k: product.get(k) for k in ("priceMin", "priceMax", "currency", "priceExpired", "priceValidUntil")})
    return digest(source)


def validate_copy(raw, product):
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, dict) or set(raw) != {"problem", "product", "value", "cta", "features"}:
        raise ValueError("copy requires five structured fields")
    if any(not isinstance(raw[k], str) or not raw[k].strip() for k in ("problem", "product", "value", "cta")):
        raise ValueError("empty copy field")
    features = raw["features"]
    if not isinstance(features, list) or len(features) > 3 or any(not isinstance(f, str) or not f.strip() or len(f) > 45 for f in features):
        raise ValueError("invalid features")
    body = "\n".join([raw[k] for k in ("problem", "product", "value", "cta")] + features)
    if len(body) > 700 or not re.search(r"[\u0600-\u06ff]", body) or re.search(r"قیمت|تومان|ریال|تخفیف|#|https?://|www\.|[0۰٠][1-9۱-۹١-٩][0-9۰-۹٠-٩]{8,9}", body, re.I):
        raise ValueError("forbidden copy content")
    numbers = lambda text: set(re.findall(r"\d+(?:\.\d+)?", text.translate(EN_DIGITS)))
    source = " ".join(str(product.get(k) or "") for k in ("name", "title", "description", "brand"))
    if numbers(body) - numbers(source):
        raise ValueError("numbers absent from source")
    return {k: ([f.strip().translate(FA_DIGITS) for f in v] if isinstance(v, list) else v.strip().translate(FA_DIGITS)) for k, v in raw.items()}


def caption(copy_fields, product):
    text = "\n\n".join(copy_fields[k] for k in ("problem", "product", "value", "cta")) + "\n" + product["url"] + "\n۰۱۳۹۱۰۰۲۰۳۰ · arominco.com"
    if len(text) > 1024:
        raise ValueError("caption too long")
    return text


def price_text(product):
    if product.get("priceExpired") or not product.get("priceMin") or not product.get("priceMax"):
        raise ValueError("verified price missing")
    def money(value):
        number = Decimal(str(value))
        if not number.is_finite() or number <= 0:
            raise ValueError("invalid source price")
        text = format(number, ",f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return text.replace(",", "٬").replace(".", "٫").translate(FA_DIGITS)
    values = [money(product[k]) for k in ("priceMin", "priceMax")]
    return (values[0] if values[0] == values[1] else " تا ".join(values)) + " تومان"


def snapshot(generation, product, copy_fields, channel, story, config):
    return dict(generation=generation, product=product, caption=caption(copy_fields, product),
                story=dict(name=product["name"], features=copy_fields["features"],
                           price=price_text(product) if config["story_show_price"] else None),
                channel_asset=channel, story_asset=story, destinations=config["destinations"])


class DeliveryError(Exception):
    def __init__(self, kind, message="provider failure", retry_after=0):
        super().__init__(message)
        self.kind, self.retry_after = kind, retry_after


def error_kind(error):
    if isinstance(error, DeliveryError):
        return error.kind
    if isinstance(error, urllib.error.HTTPError):
        return "retry" if error.code == 429 else "permanent" if 400 <= error.code < 500 else "uncertain"
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, (socket.gaierror, ConnectionRefusedError)):
        return "retry"
    # A generic timeout, SSL failure or connection reset cannot prove non-delivery.
    return "uncertain"


def render(product, copy_fields, photo, asset_dir, font_dir=None, show_price=False):
    """Return JPEG bytes and geometry; all Story content stays in the safe rectangle."""
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
        import arabic_reshaper
        from bidi.algorithm import get_display
    except ImportError as error:
        raise RuntimeError("image dependencies missing") from error
    assets = Path(asset_dir)
    fonts = Path(font_dir) if font_dir else assets / "fonts"
    regular = next(iter(sorted(fonts.glob("*Regular*.ttf"))), None)
    bold = next(iter(sorted(fonts.glob("*Bold*.ttf"))), regular)
    if regular is None:
        raise RuntimeError("image font missing")
    shape = lambda text: get_display(arabic_reshaper.reshape(str(text).translate(FA_DIGITS)))
    original = ImageOps.exif_transpose(Image.open(io.BytesIO(photo))).convert("RGB")
    geometry = []

    def fitted_text(draw, text, box, max_size, font_path, lines=1, color="#8A0C72"):
        x0, y0, x1, y1 = box
        for size in range(max_size, 7, -1):
            font = ImageFont.truetype(str(font_path), size)
            words, rows, row = text.split(), [], ""
            for word in words:
                trial = (row + " " + word).strip()
                if draw.textbbox((0, 0), shape(trial), font=font)[2] > x1 - x0 and row:
                    rows.append(row)
                    row = word
                else:
                    row = trial
            rows.append(row)
            shaped = [shape(r) for r in rows]
            bounds = [draw.textbbox((0, 0), r, font=font) for r in shaped]
            heights = [b[3] - b[1] for b in bounds]
            if len(rows) <= lines and max(b[2] - b[0] for b in bounds) <= x1 - x0 and sum(heights) + 12 * (len(rows) - 1) <= y1 - y0:
                y = y0
                for text_row, b, height in zip(shaped, bounds, heights):
                    draw.text((x1 - (b[2] - b[0]) - b[0], y - b[1]), text_row, font=font, fill=color)
                    geometry.append((x1 - (b[2] - b[0]), y, x1, y + height))
                    y += height + 12
                return
        raise ValueError("text cannot fit safe area")

    def fit_photo(canvas, box):
        x0, y0, x1, y1 = box
        fitted = ImageOps.contain(original, (x1 - x0, y1 - y0))
        canvas.paste(fitted, (x0 + (x1 - x0 - fitted.width) // 2, y0 + (y1 - y0 - fitted.height) // 2))

    def logo(canvas, box):
        mark = Image.open(assets / "aromin-logo.webp").convert("RGBA")
        mark.thumbnail((box[2] - box[0], box[3] - box[1]))
        canvas.paste(mark, (box[2] - mark.width, box[1]), mark)

    story = Image.new("RGB", (1080, 1920), "white")
    draw = ImageDraw.Draw(story)
    logo(story, (120, 250, 960, 350))
    fitted_text(draw, product["name"], (120, 380, 960, 550), 62, bold, 2)
    fit_photo(story, (120, 580, 960, 1120))
    for i, feature in enumerate(copy_fields["features"]):
        fitted_text(draw, "• " + feature, (120, 1150 + i * 95, 960, 1235 + i * 95), 38, regular, 2)
    if show_price:
        fitted_text(draw, price_text(product), (120, 1460, 960, 1530), 44, bold)
    fitted_text(draw, "۰۱۳۹۱۰۰۲۰۳۰ · arominco.com", (120, 1590, 960, 1670), 36, regular)
    story_geometry = list(geometry)
    channel = Image.new("RGB", (1080, 1080), "white")
    fit_photo(channel, (60, 60, 1020, 850))
    draw = ImageDraw.Draw(channel)
    draw.rectangle((0, 900, 1080, 1080), fill="#8A0C72")
    fitted_text(draw, product["name"], (60, 930, 1020, 1050), 52, bold, 2, "white")
    logo(channel, (60, 40, 260, 140))
    output = []
    for image in (channel, story):
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=92, optimize=True)
        output.append(buffer.getvalue())
    return output[0], output[1], story_geometry
