"""GST & Accounts Reconciliation Suite: one app, one sidebar, five modules.
GST 2A/2B, GSTR-1 + GSTR-3B, Bank, TDS, Stock. Upload files, click Run, download the Excel report.
UI languages: English, Hindi, Mandarin, Spanish, French (see i18n.py)."""
import io
import os
from datetime import date

import pandas as pd
import streamlit as st

import reco_core as rc
import gstr1_multi as gm
import bank_reco as br
import tds_reco as tr
import stock_reco as sr
import period_manager as pm
from branding import FIRM_LOCATION, FIRM_NAME, FIRM_TAGLINE, logo_path, sidebar_banner_path
from i18n import LANGUAGES, t as _t

_LOGO = logo_path()
st.set_page_config(page_title=f"GST & Accounts Reconciliation | {FIRM_NAME}", page_icon=_LOGO or "🧾", layout="wide")
if _LOGO:
    st.logo(sidebar_banner_path() or _LOGO, size="large", icon_image=_LOGO)


def T(key, **values):
    """Translated text for the language chosen in the sidebar."""
    return _t(key, st.session_state.get("lang", "en"), **values)


CSS = """
<style>
.block-container {padding-top: 1.4rem; padding-bottom: 3rem;}
.hero {background: linear-gradient(135deg,#1f3a5f 0%,#2e6da4 100%); color:#fff; padding:20px 24px; border-radius:14px; margin-bottom:16px;}
.hero h1 {color:#fff; margin:0; font-size:1.7rem;} .hero p {color:#dbe8f5; margin:4px 0 0 0;}
.kpi {border-radius:12px; padding:14px 16px; color:#fff; min-height:92px;}
.kpi .label {font-size:.85rem; opacity:.9;} .kpi .value {font-size:1.6rem; font-weight:700; line-height:1.2;}
.kpi .sub {font-size:.8rem; opacity:.9;}
.kpi.green {background:linear-gradient(135deg,#1e8e5a,#2fbf7b);} .kpi.amber {background:linear-gradient(135deg,#c98a0b,#f0b429);}
.kpi.red {background:linear-gradient(135deg,#b3261e,#e5534b);} .kpi.blue {background:linear-gradient(135deg,#2e6da4,#4b9be0);}
.note {color:#5b6675; font-size:.9rem; margin:-4px 0 12px 0;}
.brand {color:#1f3a5f; font-weight:600; font-size:.95rem; margin:0 0 8px 0;}
.brand span {color:#5b6675; font-weight:400; font-size:.85rem; margin-left:8px;}
.about {color:#5b6675; font-size:.85rem; line-height:1.4;} .about b {color:#1f3a5f;}
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)

MANUAL_FILE = os.path.join(os.environ.get("GST_RECO_DATA_DIR", os.path.dirname(os.path.abspath(__file__))),
                           "manual_note_types.csv")
TODAY = date.today()
MODULE_KEYS = ["gst2a", "gstr1", "bank", "tds", "stock"]
# Widget values are short ASCII keys, so they do not change when the language changes.
PERIOD_MODES = ["monthly", "quarterly", "fy", "custom"]
PERIOD_MODE_KEY = {"monthly": "mode_monthly", "quarterly": "mode_quarterly", "fy": "mode_fy", "custom": "mode_custom"}
PM_MODE = {"monthly": "Monthly", "quarterly": "Quarterly", "fy": "Financial Year", "custom": "Custom"}
PM_MODE_KEY = {v: k for k, v in PM_MODE.items()}
BASIS_OPTIONS = {"both": rc.BASIS_BOTH, "invoice": rc.BASIS_INVOICE, "return": rc.BASIS_RETURN}
BASIS_KEY = {"both": "basis_both", "invoice": "basis_invoice", "return": "basis_return"}
STOCK_MODES = ["snapshot", "movement"]


def _d(value):
    """Date as dd-Mon-yyyy (English month names in every language)."""
    return f"{value:%d-%b-%Y}"


def render_period_picker(prefix, default_period=None):
    """Reusable period picker. Returns a Period with inclusive start/end dates."""
    default_period = default_period or pm.period_bounds("Monthly", reference_date=TODAY)
    mode_labels = {m: T(PERIOD_MODE_KEY[m]) for m in PERIOD_MODES}
    mode = st.selectbox(T("period_type"), PERIOD_MODES,
                        index=PERIOD_MODES.index(PM_MODE_KEY[default_period.mode]) if default_period.mode in PM_MODE_KEY else 0,
                        format_func=mode_labels.get, key=f"{prefix}_mode")
    fy_years = pm.available_fy_years(first_year=2020, future_years=1)
    current_fy = pm.financial_year_start(TODAY)
    fy_default = current_fy if current_fy in fy_years else fy_years[-1]
    if mode == "monthly":
        month = st.date_input(T("select_month"), value=default_period.start.replace(day=1),
                              key=f"{prefix}_month")
        return pm.period_bounds("Monthly", month=month)
    if mode == "quarterly":
        c1, c2 = st.columns(2)
        fy = c1.selectbox(T("financial_year"), fy_years, index=fy_years.index(fy_default),
                          format_func=pm.fy_label, key=f"{prefix}_fy_q")
        q = c2.selectbox(T("quarter"), [1, 2, 3, 4], index=((TODAY.month - 4) % 12) // 3,
                         format_func=lambda x: f"Q{x}", key=f"{prefix}_quarter")
        return pm.period_bounds("Quarterly", fy_start_year=fy, quarter=q)
    if mode == "fy":
        fy = st.selectbox(T("financial_year"), fy_years, index=fy_years.index(fy_default),
                          format_func=pm.fy_label, key=f"{prefix}_fy")
        return pm.period_bounds("Financial Year", fy_start_year=fy)
    c1, c2 = st.columns(2)
    start = c1.date_input(T("from_date"), value=default_period.start, key=f"{prefix}_from")
    end = c2.date_input(T("to_date"), value=default_period.end, key=f"{prefix}_to")
    try:
        return pm.period_bounds("Custom", start=start, end=end)
    except ValueError as exc:
        st.error(str(exc))
        return None


def module_period(common_period, key):
    """Use the common reporting period by default; allow a module-level override."""
    override = st.checkbox(T("override_period"), value=False, key=f"{key}_override")
    if override:
        return render_period_picker(f"{key}_local", common_period)
    return common_period


def buf(upl):
    """Uploaded file -> fresh BytesIO each time (uploads can only be read once per parse)."""
    return io.BytesIO(upl.getvalue()) if upl is not None else None


def load_manual():
    if os.path.exists(MANUAL_FILE):
        return pd.read_csv(MANUAL_FILE, dtype=str)
    return pd.DataFrame(columns=["GSTIN", "Note No", "Type", "Basis"])


def lakh(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return "-"
    if abs(x) >= 1e7:
        return f"₹{x/1e7:,.2f} Cr"
    if abs(x) >= 1e5:
        return f"₹{x/1e5:,.2f} L"
    return f"₹{x:,.0f}"


def kpi(col, label, value, sub, color):
    col.markdown(f'<div class="kpi {color}"><div class="label">{label}</div><div class="value">{value}</div>'
                 f'<div class="sub">{sub}</div></div>', unsafe_allow_html=True)


def tables(results, height=480):
    tabs = st.tabs(list(results.keys()))
    for tab, (name, df) in zip(tabs, results.items()):
        with tab:
            st.dataframe(df, width="stretch", hide_index=True, height=height)


def need(*files):
    missing = [n for n, f in files if f is None]
    if missing:
        st.error(T("err_files", files=", ".join(missing)))
        return False
    return True


with st.sidebar:
    st.selectbox(T("ui_language"), list(LANGUAGES), format_func=LANGUAGES.get, key="lang")
    st.markdown(f"### {T('sidebar_module')}")
    module_labels = {k: T(f"mod_{k}") for k in MODULE_KEYS}
    module = st.radio(T("sidebar_module"), MODULE_KEYS, format_func=module_labels.get,
                      label_visibility="collapsed")
    st.markdown(f"### {T('sidebar_company')}")
    gstin = st.text_input(T("gstin_label"), max_chars=15).strip().upper()
    st.caption(T("gstin_caption"))
    st.markdown(f"### {T('common_period')}")
    common_period = render_period_picker("common", pm.period_bounds("Monthly", reference_date=TODAY))
    if common_period:
        st.caption(T("period_caption", label=common_period.label, start=_d(common_period.start),
                     end=_d(common_period.end)))
    st.divider()
    st.markdown(f'<div class="about"><b>{T("about_heading")}</b><br>{FIRM_NAME}<br>{FIRM_TAGLINE}<br>'
                f'{FIRM_LOCATION}</div>', unsafe_allow_html=True)

st.markdown(f'<div class="brand">{FIRM_NAME}<span>{FIRM_TAGLINE}</span></div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero"><h1>{T("mod_" + module)}</h1>'
            f'<p>{T("hero_sub")}</p></div>', unsafe_allow_html=True)

# ======================= 1. GST 2A/2B =======================
if module == "gst2a":
    active_period = module_period(common_period, "gst2a")
    basis_labels = {b: T(BASIS_KEY[b]) for b in BASIS_OPTIONS}
    basis_choice = st.radio(T("basis_label"), list(BASIS_OPTIONS), format_func=basis_labels.get,
                            horizontal=True, key="gst2a_basis")
    period_basis = BASIS_OPTIONS[basis_choice]
    if active_period:
        st.caption(T("reporting_window", label=active_period.label, start=_d(active_period.start),
                     end=_d(active_period.end)))
    st.markdown(f'<div class="note">{T("basis_note")}</div>', unsafe_allow_html=True)
    c1, c2 = st.columns(2)
    portal = c1.file_uploader(T("upload_gstr2"), type=["xlsx", "xlsm"], key="2a_p")
    books = c2.file_uploader(T("upload_books_purchase"), type=["xlsx", "xlsm"], key="2a_b")
    if st.button(T("run_gst2a"), type="primary"):
        if len(gstin) != 15:
            st.error(T("err_gstin"))
        elif active_period is None:
            st.error(T("err_period"))
        elif need((T("upload_gstr2"), portal), (T("upload_books_purchase"), books)):
            try:
                with st.spinner(T("reconciling")):
                    st.session_state["res_2a"] = rc.run_reconciliation(
                        buf(portal), buf(books), gstin, manual_types=load_manual(),
                        period_start=active_period.start, period_end=active_period.end, basis=period_basis)
                    st.session_state["gstin_2a"] = gstin
                    st.session_state["label_2a"] = active_period.label
            except Exception as e:  # file format / sheet mismatch: show message, keep app alive
                st.error(T("err_gst2a_failed", error=str(e)))
    if "res_2a" in st.session_state:
        res = st.session_state["res_2a"]
        dash = res["Dashboard"]
        b2b = dash[dash["Section"].str.startswith("B2B")].set_index("Status")

        def cnt(s, col="Count"):
            return (int(b2b.loc[s, "Count"]), b2b.loc[s, "Taxable as per 2A" if col == "2A" else "Taxable as per Books"]) if s in b2b.index else (0, 0.0)

        k1, k2, k3, k4 = st.columns(4)
        m_c, m_a = cnt("Matched", "2A")
        mm_c, mm_a = cnt("Mismatch", "2A")
        a_c, a_a = cnt("Only in 2A", "2A")
        bk_c, bk_a = cnt("Only in Books")
        kpi(k1, T("kpi_b2b_matched"), f"{m_c:,}", T("sub_taxable", amount=lakh(m_a)), "green")
        kpi(k2, T("kpi_b2b_mismatch"), f"{mm_c:,}", T("sub_taxable", amount=lakh(mm_a)), "amber")
        kpi(k3, T("kpi_only_2a_risk"), f"{a_c:,}", T("sub_taxable", amount=lakh(a_a)), "red")
        kpi(k4, T("kpi_only_books"), f"{bk_c:,}", T("sub_taxable", amount=lakh(bk_a)), "blue")
        st.write("")
        t_over, t_b2b, t_cdn, t_9, t_conf, t_dl = st.tabs([
            T("tab_overview"), T("tab_b2b"), T("tab_cdn"), T("tab_gstr9"), T("tab_confirm"), T("tab_download")])
        with t_over:
            st.dataframe(dash, width="stretch", hide_index=True)
        with t_b2b:
            st.dataframe(res["B2B Reco"], width="stretch", hide_index=True, height=520)
        with t_cdn:
            st.dataframe(res["CDN Reco"], width="stretch", hide_index=True, height=520)
        with t_9:
            st.markdown(f'<div class="note">{T("note_gstr9")}</div>', unsafe_allow_html=True)
            st.dataframe(res["GSTR-9 ITC"], width="stretch", hide_index=True)
        with t_conf:
            review = res["CDN Review"]
            if len(review):
                st.markdown(f'<div class="note">{T("note_confirm")}</div>', unsafe_allow_html=True)
                edited = st.data_editor(review, column_config={"Type (CN / DN)": st.column_config.SelectboxColumn(options=["CN", "DN"])},
                                        width="stretch", hide_index=True, key="rev_ed")
                if st.button(T("btn_save_notes")):
                    chosen = edited[edited["Type (CN / DN)"].isin(["CN", "DN"])]
                    new = pd.DataFrame({"GSTIN": chosen["GSTIN"], "Note No": chosen["Note No"],
                                        "Type": chosen["Type (CN / DN)"], "Basis": "User confirmed in app"})
                    merged = pd.concat([load_manual(), new], ignore_index=True).drop_duplicates(["GSTIN", "Note No"], keep="last")
                    merged.to_csv(MANUAL_FILE, index=False)
                    st.success(T("notes_saved", n=len(new)))
            else:
                st.success(T("notes_all_confirmed"))
        with t_dl:
            st.download_button(T("download_gst2a"),
                               data=rc.to_excel_bytes(res, gstin=st.session_state["gstin_2a"], period=st.session_state.get("label_2a", "")),
                               file_name=f"GST_2A_Reco_{st.session_state['gstin_2a']}_{st.session_state.get('label_2a', '').replace(' ', '_')}.xlsx", type="primary",
                               mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# ======================= 2. GSTR-1 & GSTR-3B (multi-month) =======================
elif module == "gstr1":
    st.markdown(f'<div class="note">{T("note_gstr1")}</div>', unsafe_allow_html=True)
    c1, c2 = st.columns(2)
    pj = c1.file_uploader(T("upload_gstr1_json"), type=["json"], accept_multiple_files=True, key="g1_p")
    bx = c2.file_uploader(T("upload_books_gstr1"), type=["xlsx", "xlsm"], accept_multiple_files=True, key="g1_b")

    bounds = module_period(common_period, "gstr1")
    if bounds:
        st.caption(T("selected_period", label=bounds.label, start=bounds.start, end=bounds.end))

    st.markdown(f"**{T('gstr1_3b_header')}**")
    default3b = pd.DataFrame(columns=["Return Period", "Taxable", "IGST", "CGST", "SGST"])
    three_b = st.data_editor(default3b, num_rows="dynamic", width="stretch", hide_index=True, key="g1_3b",
                             column_config={c: st.column_config.NumberColumn(format="%.2f") for c in ["Taxable", "IGST", "CGST", "SGST"]})

    if st.button(T("run_gstr1"), type="primary"):
        if bounds is None:
            st.error(T("err_period"))
        elif not pj or not bx:
            st.error(T("err_gstr1_files"))
        else:
            try:
                with st.spinner(T("reconciling")):
                    portal_files = [(f.name, f.getvalue()) for f in pj]
                    books_files = [(f.name, f.getvalue()) for f in bx]
                    res = gm.run(portal_files, books_files, pd.Timestamp(bounds.start), pd.Timestamp(bounds.end))
                    tie = gm.tie_out(portal_files, three_b.dropna(subset=["Return Period"]), start=bounds.start, end=bounds.end)
                    st.session_state["res_g1m"] = {"res": res, "tie": tie, "label": bounds.label, "gstin": gstin}
            except ValueError as e:
                st.error(str(e))

    if "res_g1m" in st.session_state:
        pack = st.session_state["res_g1m"]
        res, tie = pack["res"], pack["tie"]
        dash = res["Dashboard"]
        k1, k2, k3, k4 = st.columns(4)

        def _c(section, status):
            m = dash[(dash["Section"] == section) & (dash["Status"] == status)]
            return int(m["Count"].sum()) if len(m) else 0

        kpi(k1, T("kpi_b2b_matched"), f"{_c('B2B', 'Matched'):,}", pack["label"], "green")
        kpi(k2, T("kpi_b2b_mismatch"), f"{_c('B2B', 'Mismatch'):,}", pack["label"], "amber")
        kpi(k3, T("kpi_only_portal"), f"{_c('B2B', 'Only in Portal'):,}", T("sub_gstr1_not_books"), "red")
        kpi(k4, T("kpi_only_books"), f"{_c('B2B', 'Only in Books'):,}", T("sub_books_not_gstr1"), "blue")
        st.write("")
        t1, t2, t3, t4, t5, t6 = st.tabs([T("tab_dashboard"), T("tab_month"), T("tab_tieout"),
                                          T("tab_b2b_reco"), T("tab_cdnr_reco"), T("tab_download")])
        with t1:
            st.dataframe(dash, width="stretch", hide_index=True)
            st.markdown(f"**{T('tab_portal_files')}**")
            st.dataframe(res["Portal files"], width="stretch", hide_index=True)
        with t2:
            st.dataframe(res["Month-wise (portal)"], width="stretch", hide_index=True)
        with t3:
            st.dataframe(tie, width="stretch", hide_index=True)
        with t4:
            st.dataframe(res["B2B Reco"], width="stretch", hide_index=True, height=520)
        with t5:
            cd = res["CDNR Reco"]
            st.dataframe(cd if len(cd) else pd.DataFrame({"Info": [T("info_no_cdnr")]}), width="stretch", hide_index=True)
        with t6:
            pack_res = {"Dashboard": dash, "Month-wise (portal)": res["Month-wise (portal)"], "3B tie-out": tie,
                        "Portal files": res["Portal files"], "B2B Reco": res["B2B Reco"],
                        "CDNR Reco": res["CDNR Reco"] if len(res["CDNR Reco"]) else pd.DataFrame({"Info": [T("no_cdnr_rows")]})}
            st.download_button(T("download_gstr1"),
                               data=rc.to_excel_bytes(pack_res, gstin=pack["gstin"], period=pack["label"]),
                               file_name=f"GSTR1_Reco_{pack['label'].replace(' ', '_')}.xlsx", type="primary",
                               mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# ======================= 3. Bank reco =======================
elif module == "bank":
    active_period = module_period(common_period, "bank")
    c1, c2 = st.columns(2)
    stm = c1.file_uploader(T("upload_bank_stmt"), type=["xls", "xlsx"], key="bk_s")
    led = c2.file_uploader(T("upload_tally_bank"), type=["xlsx", "xlsm"], key="bk_l")
    if active_period:
        st.caption(T("selected_period", label=active_period.label, start=active_period.start, end=active_period.end)
                   + " " + T("bank_caption_note"))
    if st.button(T("run_bank"), type="primary"):
        if active_period is None:
            st.error(T("err_period"))
        elif need((T("upload_bank_stmt"), stm), (T("upload_tally_bank"), led)):
            try:
                with st.spinner(T("reconciling")):
                    st.session_state["res_bk"] = br.run_bank(buf(stm), buf(led),
                                                             period_start=active_period.start, period_end=active_period.end)
                    st.session_state["res_bk_label"] = active_period.label
            except ValueError as e:
                st.error(str(e))
    if "res_bk" in st.session_state:
        res = st.session_state["res_bk"]
        allx = res["All Entries"]
        k1, k2, k3, k4 = st.columns(4)
        kpi(k1, T("kpi_bank_matched"), f"{int((allx['Status'] == 'Matched').sum()):,}", T("sub_amount_date"), "green")
        kpi(k2, T("kpi_books_not_bank"), f"{int((allx['Status'] == 'In Books, not in Bank').sum()):,}", T("sub_timing"), "amber")
        kpi(k3, T("kpi_bank_not_books"), f"{int((allx['Status'] == 'In Bank, not in Books').sum()):,}", T("sub_entry_needed"), "red")
        kpi(k4, T("kpi_closing_diff"), lakh(res["Closing Reconciliation"].iloc[-1]["Amount"]), T("sub_unexplained"), "blue")
        st.write("")
        t1, t2, t3, t4, t5 = st.tabs([T("tab_summary"), T("tab_closing"), T("tab_exceptions"),
                                      T("tab_all_entries"), T("tab_download")])
        with t1:
            st.dataframe(res["Summary"], width="stretch", hide_index=True)
        with t2:
            st.dataframe(res["Closing Reconciliation"], width="stretch", hide_index=True)
        with t3:
            st.dataframe(res["Exceptions"], width="stretch", hide_index=True, height=480)
        with t4:
            st.dataframe(allx, width="stretch", hide_index=True, height=480)
        with t5:
            st.download_button(T("download_bank"),
                               data=rc.to_excel_bytes({k: v for k, v in res.items()}, gstin=gstin,
                                                      period=f"Bank reco {st.session_state.get('res_bk_label', '')}"),
                               file_name=f"Bank_Reco_{st.session_state.get('res_bk_label', 'period').replace(' ', '_')}.xlsx", type="primary",
                               mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# ======================= 4. TDS reco =======================
elif module == "tds":
    active_period = module_period(common_period, "tds")
    c1, c2 = st.columns(2)
    tl = c1.file_uploader(T("upload_tally_tds"), type=["xlsx", "xlsm"], key="td_l")
    ca = c2.file_uploader(T("upload_ca_tds"), type=["xlsx", "xlsm"], key="td_c")
    if active_period:
        st.caption(T("selected_period", label=active_period.label, start=active_period.start, end=active_period.end))
        if active_period.mode not in ("Quarterly", "Custom"):
            st.info(T("tds_info"))
    _fallback = pm.period_bounds("Quarterly", reference_date=TODAY)
    qs = active_period.start if active_period else _fallback.start
    qe = active_period.end if active_period else _fallback.end
    if st.button(T("run_tds"), type="primary"):
        if need((T("upload_tally_tds"), tl), (T("upload_ca_tds"), ca)):
            try:
                with st.spinner(T("reconciling")):
                    st.session_state["res_td"] = tr.run_tds(buf(tl), buf(ca), quarter_start=str(qs), quarter_end=str(qe))
            except ValueError as e:
                st.error(str(e))
    if "res_td" in st.session_state:
        res = st.session_state["res_td"]
        s = res["Summary"]
        mon = res["Monthly Reco"]
        total = mon[mon["Month"].eq("Period total")].iloc[0]
        k1, k2, k3, k4 = st.columns(4)
        kpi(k1, T("kpi_ca_tds_payable"), lakh(total["CA TDS payable"]), T("sub_period_total"), "blue")
        kpi(k2, T("kpi_tally_tds"), lakh(total["Tally TDS credited"]), T("sub_tds_credits"), "green")
        kpi(k3, T("kpi_difference"), lakh(total["Difference"]), T("sub_tally_minus_ca"), "amber")
        kpi(k4, T("kpi_ca_paid"), lakh(total["CA TDS paid"]), T("sub_period_total"), "blue")
        st.write("")
        t1, t2, t3, t4 = st.tabs([T("tab_summary"), T("tab_monthly"), T("tab_tally_entries"), T("tab_download")])
        with t1:
            st.dataframe(s, width="stretch", hide_index=True)
        with t2:
            st.dataframe(mon, width="stretch", hide_index=True)
        with t3:
            st.dataframe(res["Tally Entries"], width="stretch", hide_index=True, height=480)
        with t4:
            st.download_button(T("download_tds"),
                               data=rc.to_excel_bytes(res, gstin=gstin, period=f"TDS {qs} to {qe}"),
                               file_name=f"TDS_Reco_{qs}_to_{qe}.xlsx", type="primary",
                               mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# ======================= 5. Stock reco =======================
elif module == "stock":
    active_period = module_period(common_period, "stock")
    stock_labels = {"snapshot": T("stock_snapshot"), "movement": T("stock_movement")}
    stock_mode = st.radio(T("stock_mode_label"), STOCK_MODES, format_func=stock_labels.get,
                          horizontal=True, key="stock_mode")
    if active_period:
        st.caption(T("selected_period", label=active_period.label, start=active_period.start, end=active_period.end))
    if stock_mode == "snapshot":
        if active_period:
            st.info(T("stock_snapshot_info", date=_d(active_period.end)))
    else:
        st.info(T("stock_movement_info"))
    sf = st.file_uploader(T("upload_tally_stock"), type=["xlsx", "xlsm"], key="st_f")
    if st.button(T("run_stock"), type="primary"):
        if stock_mode == "movement":
            st.warning(T("stock_movement_warn"))
        elif need((T("upload_tally_stock"), sf)):
            with st.spinner(T("checking")):
                label = f"Stock summary {active_period.label}" if active_period else "Stock summary"
                data, summary, neg, noval = sr.build(buf(sf), gstin=gstin, period_label=label)
                st.session_state["res_st"] = (data, summary, neg, noval)
    if "res_st" in st.session_state:
        data, summary, neg, noval = st.session_state["res_st"]
        k1, k2, k3, k4 = st.columns(4)
        kpi(k1, T("kpi_neg_stock"), f"{len(neg):,}", T("sub_value", amount=lakh(neg["StockValue"].sum())), "red")
        kpi(k2, T("kpi_qty_no_value"), f"{len(noval):,}", T("sub_units", n=f"{noval['Closing'].sum():,.0f}"), "amber")
        tied = sr.all_tied(summary)
        kpi(k3, T("kpi_tieout"), T("tied") if tied else T("not_tied"),
            T("sub_items_total") if tied else T("sub_see_summary"), "green" if tied else "red")
        kpi(k4, T("kpi_items_checked"), f"{int(sr.load_items(io.BytesIO(sf.getvalue()))[0].shape[0]):,}",
            T("sub_stock_register"), "blue")
        st.write("")
        t1, t2 = st.tabs([T("tab_summary"), T("tab_download")])
        with t1:
            st.dataframe(summary, width="stretch", hide_index=True)
        with t2:
            st.download_button(T("download_stock"), data=data, file_name="Stock_Check.xlsx", type="primary",
                               mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
