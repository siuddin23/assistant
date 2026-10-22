"""Gabungkan omzet + Meta Ads menjadi metrik, alert, dan teks laporan harian."""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from . import meta_ads, sales
from .util import fmt_date, fmt_idr, fmt_num, fmt_pct, fmt_ratio, safe_div


def build_metrics(sd: sales.SalesData, ads: list[meta_ads.AdRow], d: date) -> dict:
    month_start = d.replace(day=1)
    prev7 = [d - timedelta(days=i) for i in range(1, 8)]

    day_sales = sales.summarize(sd.on(d))
    mtd_sales = sales.summarize(sd.between(month_start, d))
    avg7_omzet = sum(sales.summarize(sd.on(x))["omzet"] for x in prev7) / 7

    acc_rows = [r for r in ads if not r.campaign_id]
    day_ads = meta_ads.totals([r for r in acc_rows if r.date == d])
    mtd_ads = meta_ads.totals([r for r in acc_rows if month_start <= r.date <= d])
    avg7_spend = sum(r.spend for r in acc_rows if r.date in prev7) / 7

    per_account = {}
    for r in acc_rows:
        if r.date == d:
            per_account.setdefault(r.account_name or r.account_id, []).append(r)
    per_account = {k: meta_ads.totals(v) for k, v in per_account.items()}

    days_in_month = calendar.monthrange(d.year, d.month)[1]
    return {
        "date": d,
        "sales": day_sales,
        "sales_mtd": mtd_sales,
        "omzet_vs_7d": safe_div(day_sales["omzet"] - avg7_omzet, avg7_omzet),
        "ads": day_ads,
        "ads_mtd": mtd_ads,
        "spend_vs_7d": safe_div(day_ads["spend"] - avg7_spend, avg7_spend),
        "per_account": per_account,
        "mer": safe_div(day_sales["omzet"], day_ads["spend"]),
        "mer_mtd": safe_div(mtd_sales["omzet"], mtd_ads["spend"]),
        "ad_cost_ratio": safe_div(day_ads["spend"], day_sales["omzet"]),
        "cost_per_order": safe_div(day_ads["spend"], day_sales["orders"]),
        "projection_omzet": mtd_sales["omzet"] / d.day * days_in_month,
        "projection_spend": mtd_ads["spend"] / d.day * days_in_month,
        "issues": dict(sd.issues),
    }


def build_alerts(m: dict, t: dict) -> list[str]:
    a = []
    if m["mer"] is not None and m["mer"] < t["mer_min"]:
        a.append(f"MER {fmt_ratio(m['mer'])} di bawah target {fmt_ratio(t['mer_min'])}")
    if m["omzet_vs_7d"] is not None and m["omzet_vs_7d"] <= -t["omzet_drop_pct"]:
        a.append(f"Omzet turun {fmt_pct(-m['omzet_vs_7d'])} dari rata-rata 7 hari")
    if m["spend_vs_7d"] is not None and abs(m["spend_vs_7d"]) >= t["spend_change_pct"]:
        arah = "naik" if m["spend_vs_7d"] > 0 else "turun"
        a.append(f"Spend {arah} {fmt_pct(abs(m['spend_vs_7d']))} dari rata-rata 7 hari")
    for name, acc in m["per_account"].items():
        if acc["spend"] < t["min_spend_for_alert"]:
            continue
        if acc["roas_meta"] is not None and acc["roas_meta"] < t["roas_meta_min"]:
            a.append(f"{name}: ROAS Meta {fmt_ratio(acc['roas_meta'])} < {fmt_ratio(t['roas_meta_min'])}")
        if acc["cpp"] is not None and acc["cpp"] > t["cpp_max"]:
            a.append(f"{name}: biaya per purchase {fmt_idr(acc['cpp'])} > {fmt_idr(t['cpp_max'])}")
        if acc["ctr_link"] is not None and acc["ctr_link"] < t["ctr_link_min"]:
            a.append(f"{name}: CTR link {fmt_pct(acc['ctr_link'], 2)} < {fmt_pct(t['ctr_link_min'], 2)} (cek kreatif)")
        if acc["frequency"] is not None and acc["frequency"] > t["frequency_max"]:
            a.append(f"{name}: frekuensi {fmt_num(acc['frequency'], 2)} (audiens mulai jenuh)")
    return a


def render(m: dict, alerts: list[str], insight: str | None = None) -> str:
    s, mtd, ad, adm = m["sales"], m["sales_mtd"], m["ads"], m["ads_mtd"]
    d = m["date"]
    vs = lambda x: "" if x is None else f" ({'+' if x >= 0 else ''}{fmt_pct(x)} vs rata2 7 hari)"
    L = [f"📊 *LAPORAN HARIAN* — {fmt_date(d)}", ""]

    L += ["*💰 OMZET (spreadsheet)*",
          f"Omzet: {fmt_idr(s['omzet'])}{vs(m['omzet_vs_7d'])}",
          f"Order: {s['orders']} | AOV {fmt_idr(s['aov'])}",
          "Kategori: " + " · ".join(f"{k} {fmt_idr(v)}" for k, v in s["by_cat"].items()),
          "Bayar: " + " · ".join(f"{k} {v}" for k, v in s["by_payment"].most_common()), ""]

    L += ["*📣 META ADS*",
          f"Spend: {fmt_idr(ad['spend'])}{vs(m['spend_vs_7d'])}",
          f"Purchase (Meta): {fmt_num(ad['purchases'])} | CPP {fmt_idr(ad['cpp'] or 0)} | ROAS Meta {fmt_ratio(ad['roas_meta'])}",
          f"CPM {fmt_idr(ad['cpm'] or 0)} | CTR link {fmt_pct(ad['ctr_link'], 2)} | CPC link {fmt_idr(ad['cpc_link'] or 0)}",
          f"Hook rate {fmt_pct(ad['hook_rate'])} | Hold rate {fmt_pct(ad['hold_rate'])}"]
    if ad["leads"] or ad["messaging"]:
        L.append(f"Leads {fmt_num(ad['leads'])} | Chat WA/DM {fmt_num(ad['messaging'])}")
    for name, acc in sorted(m["per_account"].items(), key=lambda kv: -kv[1]["spend"]):
        leads = f" · {fmt_num(acc['leads'])} leads" if acc["leads"] else ""
        L.append(f"• {name}: {fmt_idr(acc['spend'])} · {fmt_num(acc['purchases'])} purchase{leads} · "
                 f"ROAS {fmt_ratio(acc['roas_meta'])} · CTR {fmt_pct(acc['ctr_link'], 2)} · "
                 f"freq {fmt_num(acc['frequency'] or 0, 2)}")
    L.append("")

    L += ["*🎯 GABUNGAN (omzet riil vs iklan)*",
          f"MER (omzet ÷ spend): {fmt_ratio(m['mer'])}",
          f"Rasio biaya iklan: {fmt_pct(m['ad_cost_ratio'])} dari omzet",
          f"Biaya iklan per order: {fmt_idr(m['cost_per_order'] or 0)}", ""]

    L += [f"*📅 BULAN INI (1–{d.day})*",
          f"Omzet {fmt_idr(mtd['omzet'])} · {mtd['orders']} order · spend {fmt_idr(adm['spend'])}",
          f"MER {fmt_ratio(m['mer_mtd'])} · ROAS Meta {fmt_ratio(adm['roas_meta'])}",
          f"Proyeksi akhir bulan: omzet {fmt_idr(m['projection_omzet'])}, spend {fmt_idr(m['projection_spend'])}", ""]

    L.append("*🎧 CS (kemarin | bulan ini)*")
    for cs, v in sorted(mtd["by_cs"].items(), key=lambda kv: -kv[1]["omzet"]):
        dv = s["by_cs"].get(cs, {"orders": 0, "omzet": 0})
        share = safe_div(v["omzet"], mtd["omzet"])
        L.append(f"• {cs}: {dv['orders']} order {fmt_idr(dv['omzet'])} | "
                 f"{v['orders']} order {fmt_idr(v['omzet'])} ({fmt_pct(share, 0)})")
    L.append("")

    if alerts:
        L += ["*⚠️ PERLU PERHATIAN*"] + [f"• {x}" for x in alerts] + [""]
    if m["issues"]:
        L += ["*🧹 KUALITAS DATA SHEET*"] + [f"• {k}: {v} baris" for k, v in m["issues"].items()] + [""]
    if insight:
        L += ["*💡 INSIGHT AI*", insight.strip(), ""]
    return "\n".join(L).strip()
