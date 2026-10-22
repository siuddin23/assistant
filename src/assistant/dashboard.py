"""Kirim spend harian Meta Ads ke dashboard (untuk MER akuisisi & CAC di sana)."""

from __future__ import annotations

import requests

from .meta_ads import AdRow


def push_ad_spend(base_url: str, token: str, rows: list[AdRow]) -> int:
    payload = {"rows": [
        {
            "date": r.date.isoformat(),
            "account_id": r.account_id,
            "account_name": r.account_name,
            "spend": r.spend,
            "purchases": r.purchases,
            "purchase_value": r.purchase_value,
            "impressions": r.impressions,
            "link_clicks": r.link_clicks,
        }
        for r in rows if not r.campaign_id
    ]}
    resp = requests.post(
        f"{base_url.rstrip('/')}/api/ingest/ad-spend",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"Dashboard ingest error {resp.status_code}: {resp.text[:300]}")
    return resp.json().get("upserted", 0)
