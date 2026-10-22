from datetime import date

import yaml

from assistant import meta_ads, notify, report, sales
from assistant.util import col_index, fmt_idr, parse_idr

CFG = yaml.safe_load(open("config.yaml"))


def make_row(cs, tgl, omzet_col, amount, cat, payment="TF", status="Terkirim"):
    row = [""] * 36
    row[col_index("A")] = cs
    row[col_index("B")] = tgl
    row[col_index("E")] = "DVN"
    row[col_index("F")] = payment
    row[col_index("J")] = "1"
    row[col_index(omzet_col)] = amount
    row[col_index("AB")] = cat
    row[col_index("AH")] = status
    return row


def sheet(*rows):
    return [["judul"], ["header"], ["rekap"], ["rekap"], *rows]


def test_parse_idr():
    assert parse_idr("1.989.000") == 1989000
    assert parse_idr("Rp32.500") == 32500
    assert parse_idr("29,9") == 29.9
    assert parse_idr("#N/A") == 0
    assert parse_idr("") == 0


def test_col_index():
    assert col_index("A") == 0
    assert col_index("Z") == 25
    assert col_index("AB") == 27


def test_fmt_idr():
    assert fmt_idr(1_543_544_550) == "Rp1,54 M"
    assert fmt_idr(63_006_000) == "Rp63,0 jt"
    assert fmt_idr(585_000) == "Rp585 rb"


def test_parse_rows_and_issues():
    sd = sales.parse_rows(sheet(
        make_row("FTRH", "01/10/2026", "Z", "1.989.000", "R"),
        make_row("RS", "01/10/2026", "Y", "990.000", "O", payment="COD"),
        make_row("RS", "01/10/2026", "Y", "999.000", "R"),          # kategori tidak cocok
        make_row("", "", "Y", "999.000", "O"),                        # tanpa tanggal
    ), CFG["sales"])
    assert len(sd.orders) == 3
    s = sales.summarize(sd.on(date(2026, 10, 1)))
    assert s["omzet"] == 1989000 + 990000 + 999000
    assert s["by_cat"]["R"] == 1989000
    assert s["by_cs"]["RS"]["orders"] == 2
    assert s["by_payment"]["COD"] == 1
    assert sd.issues["Kategori (F/O/R) tidak cocok dengan kolom omzet"] == 1
    assert sd.issues["Baris ada omzet tapi tanggal kosong"] == 1


def test_parse_insight_prefers_omni_purchase():
    row = meta_ads.parse_insight({
        "date_start": "2026-10-01", "account_id": "1", "account_name": "A",
        "spend": "1000000", "impressions": "100000", "reach": "70000", "inline_link_clicks": "800",
        "actions": [
            {"action_type": "omni_purchase", "value": "5"},
            {"action_type": "purchase", "value": "5"},
            {"action_type": "lead", "value": "3"},
            {"action_type": "video_view", "value": "9000"},
        ],
        "action_values": [{"action_type": "omni_purchase", "value": "4000000"}],
        "video_thruplay_watched_actions": [{"action_type": "video_view", "value": "2000"}],
    })
    assert row.purchases == 5 and row.purchase_value == 4000000 and row.leads == 3
    t = meta_ads.totals([row])
    assert t["roas_meta"] == 4.0
    assert t["cpp"] == 200000
    assert round(t["hook_rate"], 3) == 0.09
    assert round(t["hold_rate"], 3) == round(2000 / 9000, 3)


def test_report_end_to_end():
    d = date(2026, 10, 2)
    sd = sales.parse_rows(sheet(
        make_row("FTRH", "01/10/2026", "Z", "2.000.000", "R"),
        make_row("FTRH", "02/10/2026", "Z", "3.000.000", "R"),
        make_row("RS", "02/10/2026", "X", "1.000.000", "F"),
    ), CFG["sales"])
    ads = [
        meta_ads.AdRow(date=date(2026, 10, 1), account_id="1", account_name="Akun A", spend=1e6, impressions=1e5, reach=8e4),
        meta_ads.AdRow(date=d, account_id="1", account_name="Akun A", spend=2e6, impressions=1e5, reach=8e4,
                       link_clicks=1000, purchases=2, purchase_value=2.5e6),
    ]
    m = report.build_metrics(sd, ads, d)
    assert m["mer"] == 2.0
    assert m["mer_mtd"] == 2.0
    assert m["mer_acq"] == 0.5          # hanya F (Rp1 jt) ÷ spend Rp2 jt
    assert m["cac"] == 2e6              # 1 order baru/follow up
    assert m["repeat_share_mtd"] == 5 / 6
    assert m["sales_mtd"]["orders"] == 3
    alerts = report.build_alerts(m, CFG["targets"])
    assert any("MER akuisisi" in a for a in alerts)
    assert any("customer baru" in a for a in alerts)
    text = report.render(m, alerts)
    assert "LAPORAN HARIAN" in text and "Akun A" in text


def test_telegram_html_escapes():
    assert notify.to_telegram_html("*Omzet* <naik> & turun") == "<b>Omzet</b> &lt;naik&gt; &amp; turun"


def test_chunks_respect_limit():
    text = "\n".join(["x" * 100] * 100)
    parts = notify._chunks(text, 1000)
    assert all(len(p) <= 1000 for p in parts)
    assert "".join(parts) == text
