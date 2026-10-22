"""Baca data closing/omzet dari spreadsheet (satu tab per bulan, satu baris per transaksi).

Data pribadi customer (nama, alamat, no. WA) sengaja TIDAK dibaca ke dalam model
supaya tidak pernah ikut masuk ke laporan atau ke AI.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from .util import cell, parse_date, parse_idr, sheet_name_for

CATEGORIES = ("F", "O", "R")


@dataclass
class Order:
    date: date
    cs: str
    product_type: str
    payment: str
    category: str  # F / O / R (kolom "hio")
    omzet: float
    omzet_by_cat: dict[str, float]
    status: str
    products: dict[str, float]


@dataclass
class SalesData:
    orders: list[Order] = field(default_factory=list)
    issues: Counter = field(default_factory=Counter)

    def on(self, d: date) -> list[Order]:
        return [o for o in self.orders if o.date == d]

    def between(self, start: date, end: date) -> list[Order]:
        return [o for o in self.orders if start <= o.date <= end]


def parse_rows(rows: list[list[str]], cfg: dict) -> SalesData:
    cols = cfg["columns"]
    data = SalesData()
    for row in rows[cfg["first_data_row"] - 1:]:
        if not any((c or "").strip() for c in row):
            continue
        omzet_by_cat = {k: parse_idr(cell(row, cols[f"omzet_{k.lower()}"])) for k in CATEGORIES}
        omzet = sum(omzet_by_cat.values())
        d = parse_date(cell(row, cols["date"]))
        if d is None:
            if omzet:
                data.issues["Baris ada omzet tapi tanggal kosong"] += 1
            continue
        category = cell(row, cols["category"]).upper()
        cs = cell(row, cols["cs"]).upper()
        if not cs:
            data.issues["Baris tanpa kode CS"] += 1
        if omzet == 0:
            data.issues["Baris tanpa omzet"] += 1
        elif category in CATEGORIES and omzet_by_cat[category] == 0:
            data.issues["Kategori (F/O/R) tidak cocok dengan kolom omzet"] += 1
        elif category not in CATEGORIES:
            data.issues["Kategori F/O/R kosong"] += 1
        data.orders.append(Order(
            date=d,
            cs=cs or "?",
            product_type=cell(row, cols["product_type"]).upper(),
            payment=cell(row, cols["payment"]).upper(),
            category=category,
            omzet=omzet,
            omzet_by_cat=omzet_by_cat,
            status=cell(row, cols["status"]),
            products={p: parse_idr(cell(row, c)) for p, c in cfg.get("products", {}).items()},
        ))
    return data


def merge(parts: list[SalesData]) -> SalesData:
    out = SalesData()
    for p in parts:
        out.orders.extend(p.orders)
        out.issues.update(p.issues)
    return out


def months_needed(start: date, end: date) -> list[date]:
    months, cur = [], date(start.year, start.month, 1)
    while cur <= end:
        months.append(cur)
        cur = date(cur.year + (cur.month == 12), cur.month % 12 + 1, 1)
    return months


def load_from_google(cfg: dict, start: date, end: date, credentials_info: dict) -> SalesData:
    import gspread

    gc = gspread.service_account_from_dict(credentials_info)
    sh = gc.open_by_key(cfg["spreadsheet_id"])
    parts = []
    for m in months_needed(start, end):
        values = sh.worksheet(sheet_name_for(m)).get_all_values()
        parts.append(parse_rows(values, cfg))
    return merge(parts)


def load_from_json(paths: list[Path], cfg: dict) -> SalesData:
    """Untuk tes / jalan offline: file JSON {"values": [[...], ...]} hasil export Sheets API."""
    return merge([parse_rows(json.loads(Path(p).read_text())["values"], cfg) for p in paths])


def summarize(orders: list[Order]) -> dict:
    s = {
        "orders": len([o for o in orders if o.omzet > 0]),
        "omzet": sum(o.omzet for o in orders),
        "by_cat": {k: sum(o.omzet_by_cat[k] for o in orders) for k in CATEGORIES},
        "by_payment": Counter(o.payment or "?" for o in orders if o.omzet > 0),
        "by_cs": defaultdict(lambda: {"orders": 0, "omzet": 0.0, "cat": Counter()}),
        "returns": sum(1 for o in orders if any(w in o.status.lower() for w in ("gagal", "dikembalikan", "retur"))),
        "products": Counter(),
    }
    for o in orders:
        if o.omzet <= 0:
            continue
        cs = s["by_cs"][o.cs]
        cs["orders"] += 1
        cs["omzet"] += o.omzet
        cs["cat"][o.category or "?"] += 1
        for p, q in o.products.items():
            s["products"][p] += q
    s["aov"] = s["omzet"] / s["orders"] if s["orders"] else 0.0
    return s
