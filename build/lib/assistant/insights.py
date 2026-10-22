"""Analisis singkat + rekomendasi dari Claude, berdasarkan metrik agregat (tanpa data pribadi customer)."""

from __future__ import annotations

import json

import anthropic

MODEL = "claude-opus-5-5"

SYSTEM = """Kamu adalah analis performance marketing untuk brand skincare/kesehatan di Indonesia \
yang berjualan lewat Meta Ads dengan closing oleh tim CS via WhatsApp.
Kamu menerima metrik harian dan month-to-date dalam JSON. Tulis dalam Bahasa Indonesia, \
maksimal 6 poin bullet pendek (pakai "• "), langsung ke inti:
1. Apa yang paling berubah kemarin dan kemungkinan penyebabnya (berdasarkan angka, jangan mengarang).
2. Akun/area mana yang perlu di-scale, ditahan, atau diperbaiki, dengan alasan angka.
3. Satu catatan tentang CS jika ada yang menonjol.
Jangan mengulang semua angka; laporan utama sudah menampilkannya. \
Jika data tidak cukup untuk menyimpulkan, katakan begitu."""


def _jsonable(m: dict) -> dict:
    def conv(x):
        if isinstance(x, dict):
            return {str(k): conv(v) for k, v in x.items()}
        if isinstance(x, (list, tuple)):
            return [conv(v) for v in x]
        if isinstance(x, float):
            return round(x, 4)
        if hasattr(x, "isoformat"):
            return x.isoformat()
        return x
    return conv(m)


def generate(metrics: dict, alerts: list[str], targets: dict, context: str = "") -> str | None:
    payload = {"metrics": _jsonable(metrics), "alerts": alerts, "targets": targets, "konteks_bisnis": context}
    try:
        resp = anthropic.Anthropic().beta.messages.create(
            model=MODEL,
            max_tokens=8000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "medium"},
            system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        )
    except anthropic.APIConnectionError as e:
        print(f"[insight] gagal konek ke Claude: {e}")
        return None
    except anthropic.APIStatusError as e:
        print(f"[insight] Claude API error {e.status_code}: {e.message}")
        return None
    if resp.stop_reason == "refusal":
        print("[insight] permintaan ditolak model; laporan dikirim tanpa insight")
        return None
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return text or None
