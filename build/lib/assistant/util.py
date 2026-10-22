"""Helper kecil: parsing angka format Indonesia, kolom A1, dan format Rupiah."""

from __future__ import annotations

import re
from datetime import date, datetime

BULAN = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
]
HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


def col_index(letter: str) -> int:
    """'A' -> 0, 'Z' -> 25, 'AB' -> 27."""
    n = 0
    for ch in letter.strip().upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def cell(row: list[str], letter: str) -> str:
    i = col_index(letter)
    return row[i].strip() if i < len(row) and row[i] is not None else ""


def parse_idr(text: str) -> float:
    """'Rp1.989.000' -> 1989000.0 ; '29,9' -> 29.9 ; '' / '#N/A' -> 0.0"""
    s = re.sub(r"[^0-9,.\-]", "", text or "")
    if not s:
        return 0.0
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_date(text: str) -> date | None:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text.strip(), fmt).date()
        except ValueError:
            continue
    return None


def sheet_name_for(d: date) -> str:
    return BULAN[d.month - 1]


def fmt_idr(x: float) -> str:
    """Ringkas: Rp1,54 M / Rp63,0 jt / Rp569 rb / Rp4.090"""
    sign = "-" if x < 0 else ""
    x = abs(x)
    if x >= 1e9:
        return f"{sign}Rp{x / 1e9:.2f} M".replace(".", ",")
    if x >= 1e6:
        return f"{sign}Rp{x / 1e6:.1f} jt".replace(".", ",")
    if x >= 1e4:
        return f"{sign}Rp{x / 1e3:.0f} rb"
    return f"{sign}Rp{x:,.0f}".replace(",", ".")


def fmt_num(x: float, digits: int = 0) -> str:
    s = f"{x:,.{digits}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def fmt_pct(x: float | None, digits: int = 1) -> str:
    return "-" if x is None else f"{x * 100:.{digits}f}%".replace(".", ",")


def fmt_ratio(x: float | None, digits: int = 2) -> str:
    return "-" if x is None else f"{x:.{digits}f}x".replace(".", ",")


def fmt_date(d: date) -> str:
    return f"{HARI[d.weekday()]}, {d.day} {BULAN_PENDEK[d.month - 1]} {d.year}"


def safe_div(a: float, b: float) -> float | None:
    return a / b if b else None
