"""Kirim laporan ke Telegram (Bot API) dan WhatsApp (gateway Fonnte)."""

from __future__ import annotations

import html
import re

import requests

TELEGRAM_LIMIT = 4000


def _chunks(text: str, limit: int) -> list[str]:
    parts, cur = [], ""
    for line in text.splitlines(keepends=True):
        if len(cur) + len(line) > limit and cur:
            parts.append(cur)
            cur = ""
        cur += line
    if cur:
        parts.append(cur)
    return parts


def to_telegram_html(text: str) -> str:
    """Teks laporan memakai *tebal* gaya WhatsApp; ubah ke HTML Telegram dengan aman."""
    return re.sub(r"\*([^*\n]+)\*", r"<b>\1</b>", html.escape(text, quote=False))


def send_telegram(token: str, chat_id: str, text: str) -> None:
    for part in _chunks(text, TELEGRAM_LIMIT):
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": to_telegram_html(part), "parse_mode": "HTML",
                  "disable_web_page_preview": True},
            timeout=30,
        )
        if not r.ok:
            raise RuntimeError(f"Telegram error {r.status_code}: {r.text[:300]}")


def send_whatsapp_fonnte(token: str, target: str, text: str) -> None:
    """target: nomor (628xxx) atau beberapa nomor dipisah koma, atau ID grup WA."""
    r = requests.post(
        "https://api.fonnte.com/send",
        headers={"Authorization": token},
        data={"target": target, "message": text},
        timeout=30,
    )
    if not r.ok or (r.headers.get("content-type", "").startswith("application/json") and r.json().get("status") is False):
        raise RuntimeError(f"Fonnte error {r.status_code}: {r.text[:300]}")
