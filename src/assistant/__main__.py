"""Jalankan laporan harian.

Contoh:
  python -m assistant                      # laporan kemarin, ambil data live, kirim
  python -m assistant --date 2026-10-21 --dry-run
  python -m assistant --sales-json okt.json --ads-csv meta.csv --dry-run   # offline
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from . import meta_ads, notify, report, sales


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="assistant")
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--date", help="Tanggal laporan YYYY-MM-DD (default: kemarin)")
    ap.add_argument("--sales-json", nargs="*", help="Pakai file JSON sheet, bukan Google Sheets live")
    ap.add_argument("--ads-csv", help="Pakai CSV Meta, bukan Meta API live")
    ap.add_argument("--dry-run", action="store_true", help="Cetak laporan saja, jangan kirim")
    ap.add_argument("--no-ai", action="store_true", help="Lewati insight AI")
    ap.add_argument("--out", help="Simpan teks laporan ke file ini")
    args = ap.parse_args(argv)

    cfg = yaml.safe_load(Path(args.config).read_text())
    today = datetime.now(ZoneInfo(cfg.get("timezone", "Asia/Jakarta"))).date()
    d = date.fromisoformat(args.date) if args.date else today - timedelta(days=1)
    # Butuh awal bulan (untuk MTD) dan 7 hari sebelumnya (untuk pembanding).
    start = min(d.replace(day=1), d - timedelta(days=7))

    if args.sales_json:
        sd = sales.load_from_json([Path(p) for p in args.sales_json], cfg["sales"])
    else:
        creds = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
        sd = sales.load_from_google(cfg["sales"], start, d, creds)

    if args.ads_csv:
        ads = meta_ads.load_csv(Path(args.ads_csv))
    else:
        token = os.environ["META_ACCESS_TOKEN"]
        ads = []
        for acc in cfg["meta"]["ad_accounts"]:
            ads += meta_ads.fetch_insights(token, acc["id"], start, d, "account", cfg["meta"]["api_version"])

    if not args.dry_run and os.environ.get("DASHBOARD_URL") and os.environ.get("INGEST_TOKEN"):
        from .dashboard import push_ad_spend
        try:
            n = push_ad_spend(os.environ["DASHBOARD_URL"], os.environ["INGEST_TOKEN"], ads)
            print(f"[dashboard] {n} baris spend terkirim")
        except Exception as e:  # dashboard mati jangan menggagalkan laporan
            print(f"[dashboard] {e}", file=sys.stderr)

    metrics = report.build_metrics(sd, ads, d)
    alerts = report.build_alerts(metrics, cfg["targets"])

    insight = None
    ai = cfg.get("ai_insight", {})
    if ai.get("enabled") and not args.no_ai and os.environ.get("ANTHROPIC_API_KEY"):
        from . import insights
        insight = insights.generate(metrics, alerts, cfg["targets"], ai.get("context", ""))

    text = report.render(metrics, alerts, insight)
    if args.out:
        Path(args.out).write_text(text)
    print(text)

    if args.dry_run:
        return 0
    failures = 0
    n = cfg.get("notify", {})
    if n.get("telegram") and os.environ.get("TELEGRAM_BOT_TOKEN"):
        try:
            notify.send_telegram(os.environ["TELEGRAM_BOT_TOKEN"], os.environ["TELEGRAM_CHAT_ID"], text)
        except Exception as e:  # satu kanal gagal jangan menggagalkan kanal lain
            print(f"[telegram] {e}", file=sys.stderr)
            failures += 1
    if n.get("whatsapp") and os.environ.get("FONNTE_TOKEN"):
        try:
            notify.send_whatsapp_fonnte(os.environ["FONNTE_TOKEN"], os.environ["WHATSAPP_TARGET"], text)
        except Exception as e:
            print(f"[whatsapp] {e}", file=sys.stderr)
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
