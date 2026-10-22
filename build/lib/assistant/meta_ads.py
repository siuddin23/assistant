"""Tarik insight harian dari Meta Marketing API (level akun & campaign)."""

from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass, fields
from datetime import date
from pathlib import Path

import requests

INSIGHT_FIELDS = [
    "account_id", "account_name", "campaign_id", "campaign_name",
    "spend", "impressions", "reach", "inline_link_clicks",
    "actions", "action_values", "video_thruplay_watched_actions",
]
PURCHASE_TYPES = ("omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase")
MESSAGING_TYPE = "onsite_conversion.messaging_conversation_started_7d"


@dataclass
class AdRow:
    date: date
    account_id: str
    account_name: str
    campaign_id: str = ""
    campaign_name: str = ""
    spend: float = 0.0
    impressions: float = 0.0
    reach: float = 0.0
    link_clicks: float = 0.0
    purchases: float = 0.0
    purchase_value: float = 0.0
    leads: float = 0.0
    messaging: float = 0.0
    video_3s: float = 0.0
    thruplay: float = 0.0


def _action(items: list[dict] | None, types: tuple[str, ...]) -> float:
    """Ambil nilai action pertama yang cocok (urutan `types` = prioritas, supaya tidak dobel hitung)."""
    by_type = {a.get("action_type"): float(a.get("value", 0)) for a in items or []}
    for t in types:
        if t in by_type:
            return by_type[t]
    return 0.0


def parse_insight(item: dict) -> AdRow:
    actions = item.get("actions")
    return AdRow(
        date=date.fromisoformat(item["date_start"]),
        account_id=item.get("account_id", ""),
        account_name=item.get("account_name", ""),
        campaign_id=item.get("campaign_id", ""),
        campaign_name=item.get("campaign_name", ""),
        spend=float(item.get("spend", 0)),
        impressions=float(item.get("impressions", 0)),
        reach=float(item.get("reach", 0)),
        link_clicks=float(item.get("inline_link_clicks", 0)),
        purchases=_action(actions, PURCHASE_TYPES),
        purchase_value=_action(item.get("action_values"), PURCHASE_TYPES),
        leads=_action(actions, ("lead",)),
        messaging=_action(actions, (MESSAGING_TYPE,)),
        video_3s=_action(actions, ("video_view",)),
        thruplay=_action(item.get("video_thruplay_watched_actions"), ("video_view",)),
    )


def fetch_insights(token: str, account_id: str, start: date, end: date,
                   level: str = "account", api_version: str = "v24.0") -> list[AdRow]:
    url = f"https://graph.facebook.com/{api_version}/act_{account_id}/insights"
    params = {
        "access_token": token,
        "level": level,
        "time_increment": 1,
        "time_range": json.dumps({"since": start.isoformat(), "until": end.isoformat()}),
        "fields": ",".join(INSIGHT_FIELDS),
        "limit": 500,
    }
    rows: list[AdRow] = []
    while url:
        resp = requests.get(url, params=params, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"Meta API error akun {account_id}: {resp.status_code} {resp.text[:300]}")
        payload = resp.json()
        rows.extend(parse_insight(i) for i in payload.get("data", []))
        url = payload.get("paging", {}).get("next")
        params = None  # URL "next" sudah membawa semua parameter
    return rows


def load_csv(path: Path) -> list[AdRow]:
    out = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            kw = {}
            for fld in fields(AdRow):
                v = r.get(fld.name, "")
                if fld.name == "date":
                    kw["date"] = date.fromisoformat(v)
                elif fld.type == "float" or fld.type is float:
                    kw[fld.name] = float(v or 0)
                else:
                    kw[fld.name] = v
            out.append(AdRow(**kw))
    return out


def save_csv(rows: list[AdRow], path: Path) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[x.name for x in fields(AdRow)])
        w.writeheader()
        for r in rows:
            w.writerow(asdict(r))


def totals(rows: list[AdRow]) -> dict:
    t = {k: sum(getattr(r, k) for r in rows) for k in (
        "spend", "impressions", "reach", "link_clicks", "purchases", "purchase_value",
        "leads", "messaging", "video_3s", "thruplay")}
    imp, spend = t["impressions"], t["spend"]
    t["cpm"] = spend / imp * 1000 if imp else None
    t["ctr_link"] = t["link_clicks"] / imp if imp else None
    t["cpc_link"] = spend / t["link_clicks"] if t["link_clicks"] else None
    t["cpp"] = spend / t["purchases"] if t["purchases"] else None
    t["roas_meta"] = t["purchase_value"] / spend if spend else None
    t["hook_rate"] = t["video_3s"] / imp if imp else None
    t["hold_rate"] = t["thruplay"] / t["video_3s"] if t["video_3s"] else None
    # Frekuensi harian per akun; reach tidak bisa dijumlah lintas hari/akun dengan tepat.
    t["frequency"] = imp / t["reach"] if t["reach"] else None
    return t
