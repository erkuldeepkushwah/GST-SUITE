import { LanguageCode } from '../types';

export const LANGUAGES: Record<LanguageCode, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  zh: "中文 (Mandarin)",
  es: "Español",
  fr: "Français",
};

export const RAW_STRINGS: Record<string, [string, string, string, string, string]> = {
  // ---- general ----
  app_title: ["GST & Accounts Reconciliation", "GST और लेखा मिलान", "GST 与账务核对", "Conciliación GST y contable", "Rapprochement GST et comptable"],
  hero_sub: [
    "Upload files, click Run, then download the Excel report.",
    "फ़ाइलें अपलोड करें, Run दबाएँ, और Excel रिपोर्ट डाउनलोड करें।",
    "上传文件，点击运行，然后下载 Excel 报告。",
    "Suba los archivos, pulse Ejecutar y descargue el informe Excel.",
    "Chargez les fichiers, cliquez sur Exécuter, puis téléchargez le rapport Excel."
  ],
  about_heading: ["About", "परिचय", "关于", "Acerca de", "À propos"],
  sidebar_module: ["Module", "मॉड्यूल", "模块", "Módulo", "Module"],
  sidebar_company: ["Company", "कंपनी", "公司", "Empresa", "Entreprise"],
  tab_hsn: ["HSN Summary", "HSN सारांश", "HSN 汇总", "Resumen HSN", "Récapitulatif HSN"],
  info_no_hsn: ["No HSN lines found in the uploaded files.", "अपलोड की गई फ़ाइलों में कोई HSN पंक्ति नहीं मिली।", "上传的文件中没有 HSN 明细。", "No se encontraron líneas HSN en los archivos subidos.", "Aucune ligne HSN dans les fichiers importés."],
  stock_period_note: ["Stock snapshot is a point-in-time report - the period does not filter it, it only names the file.", "स्टॉक स्नैपशॉट एक तत्काल स्थिति की रिपोर्ट है - पीरियड इस पर फ़िल्टर नहीं करता, सिर्फ़ फ़ाइल का नाम तय करता है।", "库存快照是时点报表，期间不会对其过滤，仅用于文件命名。", "El snapshot de stock es una foto en un momento dado: el período no lo filtra, solo nombra el archivo.", "L'instantané de stock est une photo à un instant donné : la période ne le filtre pas, elle ne sert qu'au nom du fichier."],
  gstin_invalid: ["Checksum does not match - please re-check", "चेकसम मेल नहीं खा रहा - दोबारा जाँचें", "校验位不匹配，请重新核对", "La suma de verificación no coincide: revísalo", "La clé de contrôle ne correspond pas : vérifiez"],
  gstin_label: ["GSTIN (15 characters)", "GSTIN (15 अक्षर)", "GSTIN（15 位）", "GSTIN (15 caracteres)", "GSTIN (15 caractères)"],
  gstin_caption: ["Enter GSTIN", "GSTIN दर्ज करें", "输入 GSTIN", "Ingrese el GSTIN", "Saisissez le GSTIN"],
  gstin_reason_length: [
    "GSTIN must be exactly 15 characters",
    "GSTIN ठीक 15 अक्षरों का होना चाहिए",
    "GSTIN 必须正好是 15 位",
    "El GSTIN debe tener exactamente 15 caracteres",
    "Le GSTIN doit comporter exactement 15 caractères"
  ],
  gstin_reason_charset: [
    "Only letters A-Z and digits 0-9 are allowed",
    "सिर्फ़ A-Z अक्षर और 0-9 अंक मान्य हैं",
    "只允许 A-Z 字母和 0-9 数字",
    "Solo se permiten letras A-Z y dígitos 0-9",
    "Seules les lettres A-Z et les chiffres 0-9 sont autorisés"
  ],
  gstin_reason_pattern: [
    "Wrong GSTIN format: state code + PAN + entity + Z + check digit",
    "GSTIN का ढाँचा गलत: राज्य कोड + PAN + एंटिटी + Z + चेक अंक",
    "GSTIN 格式错误：州代码 + PAN + 实体号 + Z + 校验位",
    "Formato de GSTIN incorrecto: código de estado + PAN + entidad + Z + dígito de control",
    "Format GSTIN incorrect : code d'État + PAN + entité + Z + clé de contrôle"
  ],
  gstin_reason_pan: [
    "The 4th PAN character is not a valid holder type",
    "PAN का चौथा अक्षर मान्य धारक प्रकार नहीं है",
    "PAN 的第 4 位不是有效的持有人类型",
    "El 4.º carácter del PAN no es un tipo de titular válido",
    "Le 4e caractère du PAN n'est pas un type de titulaire valide"
  ],
  gstin_reason_state: [
    "State code {code} is not a valid GST state code",
    "राज्य कोड {code} मान्य GST राज्य कोड नहीं है",
    "州代码 {code} 不是有效的 GST 州代码",
    "El código de estado {code} no es un código GST válido",
    "Le code d'État {code} n'est pas un code GST valide"
  ],
  gstin_reason_checksum: [
    "Check digit does not match - please re-check",
    "चेक अंक मेल नहीं खा रहा - दोबारा जाँचें",
    "校验位不匹配，请重新核对",
    "El dígito de control no coincide: revísalo",
    "La clé de contrôle ne correspond pas : vérifiez"
  ],
  gstin_health_title: ["GSTIN check", "GSTIN जाँच", "GSTIN 检查", "Verificación de GSTIN", "Contrôle des GSTIN"],
  gstin_health_note: [
    "Every GSTIN in the imported rows is checked for format, state code, PAN holder type and check digit. Fix these before you file - one wrong character splits a single party into two in the reconciliation.",
    "आयात की गई पंक्तियों के हर GSTIN का ढाँचा, राज्य कोड, PAN धारक प्रकार और चेक अंक जाँचा गया है। फ़ाइलिंग से पहले इन्हें ठीक करें - एक ग़लत अक्षर से मिलान में एक ही पार्टी दो हो जाती है।",
    "已检查导入行中每个 GSTIN 的格式、州代码、PAN 持有人类型和校验位。申报前请先修正这些项——一个错误的字符会让同一交易方在核对中变成两个。",
    "Se revisa el formato, código de estado, tipo de titular del PAN y dígito de control de cada GSTIN importado. Corríjalos antes de presentar: un solo carácter erróneo divide a una parte en dos en la conciliación.",
    "Le format, le code d'État, le type de titulaire du PAN et la clé de contrôle de chaque GSTIN importé sont vérifiés. Corrigez-les avant le dépôt : un seul caractère erroné dédouble une partie dans le rapprochement."
  ],
  gstin_health_clean: [
    "All {checked} GSTINs in the imported rows are valid.",
    "आयात की गई पंक्तियों के सभी {checked} GSTIN मान्य हैं।",
    "导入行中的全部 {checked} 个 GSTIN 均有效。",
    "Los {checked} GSTIN de las filas importadas son válidos.",
    "Les {checked} GSTIN des lignes importées sont valides."
  ],
  gstin_stat_valid: ["Valid rows", "मान्य पंक्तियाँ", "有效行", "Filas válidas", "Lignes valides"],
  gstin_stat_invalid: ["Invalid rows", "अमान्य पंक्तियाँ", "无效行", "Filas no válidas", "Lignes non valides"],
  gstin_stat_missing: ["Missing GSTIN", "GSTIN नहीं है", "缺少 GSTIN", "Sin GSTIN", "GSTIN absent"],
  gstin_stat_unique: ["Unique GSTINs", "अलग-अलग GSTIN", "不同 GSTIN", "GSTIN distintos", "GSTIN distincts"],
  gstin_issues_title: [
    "GSTINs that need attention",
    "ध्यान देने योग्य GSTIN",
    "需要处理的 GSTIN",
    "GSTIN que requieren atención",
    "GSTIN à vérifier"
  ],
  gstin_audit_download: [
    "Download GSTIN issues (CSV)",
    "GSTIN समस्याएँ डाउनलोड करें (CSV)",
    "下载 GSTIN 问题清单（CSV）",
    "Descargar incidencias de GSTIN (CSV)",
    "Télécharger les anomalies GSTIN (CSV)"
  ],
  common_period: ["Common reporting period", "सामान्य रिपोर्टिंग अवधि", "通用报告期间", "Período de informe común", "Période de rapport commune"],
  period_caption: ["{label}: {start} to {end}", "{label}: {start} से {end}", "{label}：{start} 至 {end}", "{label}: {start} a {end}", "{label} : {start} au {end}"],
  period_type: ["Period type", "अवधि का प्रकार", "期间类型", "Tipo de período", "Type de période"],
  mode_monthly: ["Monthly", "मासिक", "按月", "Mensual", "Mensuel"],
  mode_quarterly: ["Quarterly", "त्रैमासिक", "按季度", "Trimestral", "Trimestriel"],
  mode_fy: ["Financial Year", "वित्त वर्ष", "财年", "Año fiscal", "Exercice fiscal"],
  mode_custom: ["Custom", "कस्टम", "自定义", "Personalizado", "Personnalisé"],
  select_month: ["Select month", "महीना चुनें", "选择月份", "Seleccione el mes", "Sélectionner le mois"],
  financial_year: ["Financial year", "वित्त वर्ष", "财年", "Año fiscal", "Exercice fiscal"],
  quarter: ["Quarter", "तिमाही", "季度", "Trimestre", "Trimestre"],
  from_date: ["From date", "से तारीख", "开始日期", "Desde", "Du"],
  to_date: ["To date", "तक तारीख", "结束日期", "Hasta", "Au"],
  override_period: [
    "Override common period for this module",
    "इस मॉड्यूल के लिए सामान्य अवधि बदलें",
    "为此模块覆盖通用期间",
    "Cambiar el período común para este módulo",
    "Remplacer la période commune pour ce module"
  ],
  selected_period: [
    "Selected period: {label} ({start} to {end})",
    "चुनी गई अवधि: {label} ({start} से {end})",
    "所选期间：{label}（{start} 至 {end}）",
    "Período seleccionado: {label} ({start} a {end})",
    "Période sélectionnée : {label} ({start} au {end})"
  ],
  reporting_window: [
    "Reporting window: {label} | {start} to {end}",
    "रिपोर्टिंग अवधि: {label} | {start} से {end}",
    "报告期间：{label} | {start} 至 {end}",
    "Ventana de informe: {label} | {start} a {end}",
    "Fenêtre de rapport : {label} | {start} au {end}"
  ],
  err_gstin: [
    "Enter a valid 15-character GSTIN (sidebar).",
    "सही 15 अक्षर का GSTIN डालें (sidebar)।",
    "请输入有效的 15 位 GSTIN（侧边栏）。",
    "Ingrese un GSTIN válido de 15 caracteres (barra lateral).",
    "Saisissez un GSTIN valide de 15 caractères (barre latérale)."
  ],
  err_gstin_reason: [
    "Company GSTIN is not valid: {reason}. Fix it in the sidebar",
    "कंपनी GSTIN मान्य नहीं है: {reason}। इसे sidebar में ठीक करें",
    "公司 GSTIN 无效：{reason}。请在侧边栏修正",
    "El GSTIN de la empresa no es válido: {reason}. Corríjalo en la barra lateral",
    "Le GSTIN de l'entreprise n'est pas valide : {reason}. Corrigez-le dans la barre latérale"
  ],
  err_export: [
    "Could not create the file: {error}",
    "फ़ाइल नहीं बन पाई: {error}",
    "无法生成文件：{error}",
    "No se pudo crear el archivo: {error}",
    "Impossible de créer le fichier : {error}"
  ],
  export_running: [
    "Preparing file...",
    "फ़ाइल तैयार हो रही है...",
    "正在生成文件...",
    "Preparando el archivo...",
    "Préparation du fichier..."
  ],
  err_period: [
    "Please choose a valid period.",
    "सही अवधि चुनें।",
    "请选择有效的期间。",
    "Elija un período válido.",
    "Choisissez une période valide."
  ],
  err_files: [
    "Please upload these files: {files}",
    "ये फ़ाइलें अपलोड करें: {files}",
    "请上传以下文件：{files}",
    "Suba estos archivos: {files}",
    "Chargez ces fichiers : {files}"
  ],
  reconciling: ["Reconciling...", "मिलान हो रहा है...", "正在核对...", "Conciliando...", "Rapprochement en cours..."],
  checking: ["Checking...", "जाँच हो रही है...", "正在检查...", "Verificando...", "Vérification en cours..."],
  tab_download: ["Download", "डाउनलोड", "下载", "Descargar", "Télécharger"],
  tab_summary: ["Summary", "सारांश", "摘要", "Resumen", "Résumé"],
  tab_dashboard: ["Dashboard", "डैशबोर्ड", "仪表板", "Panel", "Tableau de bord"],
  tab_month: ["Month-wise", "महीनेवार", "按月", "Por mes", "Par mois"],
  tab_tieout: ["3B tie-out", "3B मिलान", "3B 核对", "Conciliación 3B", "Rapprochement 3B"],
  tab_b2b_reco: ["B2B reco", "B2B मिलान", "B2B 核对", "Conciliación B2B", "Rapprochement B2B"],
  tab_cdnr_reco: ["CDNR reco", "CDNR मिलान", "CDNR 核对", "Conciliación CDNR", "Rapprochement CDNR"],
  tab_overview: ["Overview", "सामान्य जानकारी", "概览", "Resumen general", "Vue d'ensemble"],
  tab_b2b: ["B2B", "B2B", "B2B", "B2B", "B2B"],
  tab_cdn: ["CN / DN", "CN / DN", "CN / DN", "NC / ND", "AC / ND"],
  tab_gstr9: ["GSTR-9 ITC", "GSTR-9 ITC", "GSTR-9 ITC", "ITC GSTR-9", "ITC GSTR-9"],
  tab_confirm: ["Confirm notes", "नोट्स की पुष्टि", "确认票据", "Confirmar notas", "Confirmer les notes"],
  tab_closing: ["Closing reconciliation", "समापन मिलान", "期末核对", "Conciliación de cierre", "Rapprochement de clôture"],
  tab_exceptions: ["Exceptions", "अपवाद", "例外", "Excepciones", "Exceptions"],
  tab_all_entries: ["All entries", "सभी प्रविष्टियाँ", "所有条目", "Todas las entradas", "Toutes les écritures"],
  tab_monthly: ["Monthly reco", "मासिक मिलान", "按月核对", "Conciliación mensual", "Rapprochement mensuel"],
  tab_tally_entries: ["Tally entries", "Tally प्रविष्टियाँ", "Tally 条目", "Entradas de Tally", "Écritures Tally"],
  tab_portal_files: [
    "Portal files in this period",
    "इस अवधि की पोर्टल फ़ाइलें",
    "本期间的门户文件",
    "Archivos del portal en este período",
    "Fichiers du portail pour cette période"
  ],
  // ---- module names ----
  mod_gst2a: ["GST 2A/2B reco", "GST 2A/2B मिलान", "GST 2A/2B 核对", "Conciliación GST 2A/2B", "Rapprochement GST 2A/2B"],
  mod_gstr1: [
    "GSTR-1 & GSTR-3B reco",
    "GSTR-1 और GSTR-3B मिलान",
    "GSTR-1 与 GSTR-3B 核对",
    "Conciliación GSTR-1 y GSTR-3B",
    "Rapprochement GSTR-1 et GSTR-3B"
  ],
  mod_gstreco: [
    "GST-Reconciliation",
    "GST-मिलान (फ़ाइल मैपिंग)",
    "GST 核对（文件映射）",
    "GST-Conciliación",
    "GST-Rapprochement"
  ],
  reco_intro: [
    "Import any portal file (GSTR-2A / 2B / 1) and any books file (Tally purchase or sales). Columns are detected automatically - check the mapping before importing, then reconcile invoice by invoice.",
    "कोई भी पोर्टल फ़ाइल (GSTR-2A / 2B / 1) और कोई भी बुक्स फ़ाइल (Tally खरीद या बिक्री) आयात करें। कॉलम अपने आप पहचाने जाते हैं - आयात से पहले मैपिंग जाँचें, फिर इनवॉइस-दर-इनवॉइस मिलान करें।",
    "导入任意门户文件（GSTR-2A / 2B / 1）和任意账簿文件（Tally 采购或销售）。列会自动识别——导入前请核对映射，然后逐张发票核对。",
    "Importe cualquier archivo del portal (GSTR-2A / 2B / 1) y cualquier archivo de libros (compra o venta de Tally). Las columnas se detectan solas: revise la asignación antes de importar y luego concilie factura por factura.",
    "Importez n'importe quel fichier du portail (GSTR-2A / 2B / 1) et n'importe quel fichier comptable (achat ou vente Tally). Les colonnes sont détectées automatiquement : vérifiez la correspondance avant d'importer, puis rapprochez facture par facture."
  ],
  reco_portal_file: ["Portal file (GSTR-2A / 2B / 1)", "पोर्टल फ़ाइल (GSTR-2A / 2B / 1)", "门户文件（GSTR-2A / 2B / 1）", "Archivo del portal (GSTR-2A / 2B / 1)", "Fichier du portail (GSTR-2A / 2B / 1)"],
  reco_books_file: ["Books file (Tally purchase / sales)", "बुक्स फ़ाइल (Tally खरीद / बिक्री)", "账簿文件（Tally 采购 / 销售）", "Archivo de libros (compra / venta Tally)", "Fichier comptable (achat / vente Tally)"],
  reco_choose_file: ["Choose Excel or CSV", "Excel या CSV चुनें", "选择 Excel 或 CSV", "Elija Excel o CSV", "Choisir Excel ou CSV"],
  reco_sheet: ["Sheet", "शीट", "工作表", "Hoja", "Feuille"],
  reco_ready: ["{n} rows ready", "{n} पंक्तियाँ तैयार", "{n} 行已就绪", "{n} filas listas", "{n} lignes prêtes"],
  reco_not_mapped: ["(Not mapped)", "(मैप नहीं)", "（未映射）", "(Sin asignar)", "(Non associé)"],
  reco_file_rows: ["{name}: {n} rows", "{name}: {n} पंक्तियाँ", "{name}：{n} 行", "{name}: {n} filas", "{name} : {n} lignes"],
  reco_import: ["Import these rows", "इन पंक्तियों को आयात करें", "导入这些行", "Importar estas filas", "Importer ces lignes"],
  reco_reimport: ["Re-import ({n} rows)", "फिर आयात करें ({n} पंक्तियाँ)", "重新导入（{n} 行）", "Reimportar ({n} filas)", "Réimporter ({n} lignes)"],
  reco_imported: ["{n} rows imported from {name}", "{name} से {n} पंक्तियाँ आयात हुईं", "已从 {name} 导入 {n} 行", "Se importaron {n} filas de {name}", "{n} lignes importées depuis {name}"],
  reco_pair_label: ["Reconciliation", "मिलान का प्रकार", "核对类型", "Tipo de conciliación", "Type de rapprochement"],
  reco_file_type: ["File type / source", "फ़ाइल का प्रकार / स्रोत", "文件类型 / 来源", "Tipo de archivo / origen", "Type de fichier / source"],
  err_reco_wrong_type: [
    "{side} is imported as {actual}, but this reconciliation needs {expected}. Change its file type, or import the right file.",
    "{side} {actual} के रूप में आयात हुई है, पर इस मिलान के लिए {expected} चाहिए। फ़ाइल का प्रकार बदलें या सही फ़ाइल आयात करें।",
    "{side} 已按 {actual} 导入，但此核对需要 {expected}。请更改文件类型或导入正确的文件。",
    "{side} se importó como {actual}, pero esta conciliación necesita {expected}. Cambie el tipo de archivo o importe el correcto.",
    "{side} a été importé comme {actual}, mais ce rapprochement exige {expected}. Changez le type de fichier ou importez le bon."
  ],
  reco_done_filtered: [
    "{n} invoices compared - portal {portal}/{portalTotal} rows and books {books}/{booksTotal} rows fall inside this period.",
    "{n} इनवॉइस मिलाए गए - इस अवधि में पोर्टल की {portal}/{portalTotal} और बुक्स की {books}/{booksTotal} पंक्तियाँ आती हैं।",
    "已核对 {n} 张发票——本期间内门户 {portal}/{portalTotal} 行、账簿 {books}/{booksTotal} 行。",
    "{n} facturas comparadas: del portal {portal}/{portalTotal} filas y de libros {books}/{booksTotal} caen en este período.",
    "{n} factures rapprochées : {portal}/{portalTotal} lignes du portail et {books}/{booksTotal} lignes comptables dans cette période."
  ],
  reco_match_on_date: [
    "Also match on invoice date",
    "इनवॉइस तारीख से भी मिलाएँ",
    "同时按发票日期核对",
    "Comparar también por fecha de factura",
    "Rapprocher aussi par date de facture"
  ],
  reco_done_date_diff: [
    "{n} invoices compared on GSTIN + bill number; {d} of them carry a different invoice date on the two sides - see the Date match column.",
    "{n} इनवॉइस GSTIN + बिल नंबर पर मिलाए गए; इनमें {d} की तारीख दोनों तरफ़ अलग है - 'Date match' कॉलम देखें।",
    "已按 GSTIN + 单据号核对 {n} 张发票；其中 {d} 张两侧日期不同——请看 Date match 列。",
    "Se compararon {n} facturas por GSTIN + número de factura; en {d} la fecha difiere entre los dos lados: vea la columna Date match.",
    "{n} factures rapprochées sur GSTIN + numéro ; pour {d} d'entre elles la date diffère entre les deux côtés — voir la colonne Date match."
  ],
  err_reco_period_empty: [
    "Nothing falls inside {period}: portal {portal}/{portalTotal} rows, books {books}/{booksTotal} rows. Change the reporting period in the sidebar, or check the file type.",
    "{period} में कुछ नहीं आता: पोर्टल {portal}/{portalTotal} पंक्तियाँ, बुक्स {books}/{booksTotal} पंक्तियाँ। sidebar में रिपोर्टिंग अवधि बदलें या फ़ाइल का प्रकार जाँचें।",
    "{period} 内没有数据：门户 {portal}/{portalTotal} 行，账簿 {books}/{booksTotal} 行。请在侧边栏更改报告期间，或检查文件类型。",
    "Nada cae dentro de {period}: portal {portal}/{portalTotal} filas, libros {books}/{booksTotal} filas. Cambie el período en la barra lateral o revise el tipo de archivo.",
    "Rien ne tombe dans {period} : portail {portal}/{portalTotal} lignes, livres {books}/{booksTotal} lignes. Changez la période dans la barre latérale ou vérifiez le type de fichier."
  ],
  reco_run: ["Run reconciliation", "मिलान चलाएँ", "运行核对", "Ejecutar conciliación", "Lancer le rapprochement"],
  reco_tolerance: ["Tolerance (Rs)", "सहनशीलता (रु)", "容差（卢比）", "Tolerancia (Rs)", "Tolérance (Rs)"],
  reco_load_sample: ["Load sample data", "सैंपल डेटा लोड करें", "加载示例数据", "Cargar datos de ejemplo", "Charger des données d'exemple"],
  reco_sample_loaded: ["Sample files loaded and mapped - press Run.", "सैंपल फ़ाइलें लोड और मैप हो गईं - Run दबाएँ।", "示例文件已加载并映射——请点运行。", "Archivos de ejemplo cargados y asignados: pulse Ejecutar.", "Fichiers d'exemple chargés et associés : lancez le rapprochement."],
  reco_done: ["{n} invoices compared.", "{n} इनवॉइस मिलाए गए।", "已核对 {n} 张发票。", "{n} facturas comparadas.", "{n} factures rapprochées."],
  reco_kpi_possible: ["Possible match", "संभावित मिलान", "可能匹配", "Coincidencia posible", "Correspondance possible"],
  reco_kpi_possible_sub: [
    "GSTIN {gstin} mismatch",
    "GSTIN {gstin} में अंतर",
    "GSTIN {gstin} 处不符",
    "GSTIN {gstin} no coincide",
    "GSTIN {gstin} différents"
  ],
  reco_kpi_field_mismatch: [
    "Bill No {bill} | Taxable {taxable} | Tax {tax}",
    "बिल नं {bill} | टैक्सेबल {taxable} | टैक्स {tax}",
    "单据号 {bill} | 应税值 {taxable} | 税额 {tax}",
    "Factura {bill} | Base {taxable} | Impuesto {tax}",
    "Facture {bill} | Base {taxable} | Taxe {tax}"
  ],
  reco_kpi_only_one_side: ["Not matched", "बिना मिलान", "未匹配", "Sin coincidencia", "Non rapproché"],
  reco_kpi_only_split: ["{portal} only in portal | {books} only in books", "{portal} सिर्फ़ पोर्टल में | {books} सिर्फ़ बुक्स में", "{portal} 仅门户 | {books} 仅账簿", "{portal} solo en el portal | {books} solo en libros", "{portal} portail seulement | {books} livres seulement"],
  reco_kpi_matched: ["Matched", "मिले", "已匹配", "Coinciden", "Concordantes"],
  reco_kpi_mismatch: ["Mismatch", "मिलान नहीं", "不符", "No coincide", "Non concordant"],
  reco_kpi_only_portal: ["Only in portal", "सिर्फ़ पोर्टल में", "仅门户有", "Solo en el portal", "Portail seulement"],
  reco_kpi_only_books: ["Only in books", "सिर्फ़ बुक्स में", "仅账簿有", "Solo en libros", "Livres seulement"],
  reco_kpi_invoices: ["invoice level", "इनवॉइस स्तर", "发票级", "a nivel de factura", "au niveau facture"],
  reco_kpi_value_diff: ["amount differs", "राशि अलग", "金额不同", "importe distinto", "montant différent"],
  reco_kpi_books_missing: ["missing in books", "बुक्स में नहीं", "账簿中缺失", "faltan en libros", "absentes des livres"],
  reco_kpi_portal_missing: ["missing in portal", "पोर्टल में नहीं", "门户中缺失", "faltan en el portal", "absentes du portail"],
  reco_tab_reco: ["Invoice reconciliation", "इनवॉइस मिलान", "发票核对", "Conciliación de facturas", "Rapprochement des factures"],
  reco_tab_3b: ["GSTR-3B summary", "GSTR-3B सारांश", "GSTR-3B 汇总", "Resumen GSTR-3B", "Récapitulatif GSTR-3B"],
  reco_tab_export: ["Download", "डाउनलोड", "下载", "Descargar", "Télécharger"],
  reco_3b_note: [
    "Type the figures filed in GSTR-3B and the figures as per your books. The difference column is Books minus Portal.",
    "GSTR-3B में दर्ज आँकड़े और अपनी बुक्स के आँकड़े भरें। अंतर कॉलम = बुक्स घटा पोर्टल।",
    "填写 GSTR-3B 已申报的数据和账簿数据。差额列 = 账簿 − 门户。",
    "Escriba las cifras presentadas en GSTR-3B y las de sus libros. La columna de diferencia es Libros menos Portal.",
    "Saisissez les chiffres déposés dans le GSTR-3B et ceux de vos livres. La colonne d'écart = Livres moins Portail."
  ],
  reco_3b_particulars: ["Particulars", "विवरण", "项目", "Concepto", "Libellé"],
  reco_3b_portal: ["Portal (Rs)", "पोर्टल (रु)", "门户（卢比）", "Portal (Rs)", "Portail (Rs)"],
  reco_3b_books: ["Books (Rs)", "बुक्स (रु)", "账簿（卢比）", "Libros (Rs)", "Livres (Rs)"],
  reco_3b_diff: ["Difference (Books - Portal)", "अंतर (बुक्स - पोर्टल)", "差额（账簿 − 门户）", "Diferencia (Libros - Portal)", "Écart (Livres - Portail)"],
  reco_export_title: ["Ready to export", "निर्यात के लिए तैयार", "可以导出", "Listo para exportar", "Prêt à exporter"],
  reco_export_note: [
    "One workbook with Invoice Reco, Exceptions, 3B Summary and both imported sides.",
    "एक वर्कबुक: Invoice Reco, Exceptions, 3B Summary और दोनों आयातित पक्ष।",
    "一个工作簿：发票核对、例外、3B 汇总以及导入的两侧数据。",
    "Un libro: conciliación, excepciones, resumen 3B y ambos lados importados.",
    "Un classeur : rapprochement, exceptions, récapitulatif 3B et les deux côtés importés."
  ],
  reco_export_btn: ["Download reconciliation report (.xlsx)", "मिलान रिपोर्ट डाउनलोड करें (.xlsx)", "下载核对报告（.xlsx）", "Descargar informe de conciliación (.xlsx)", "Télécharger le rapport (.xlsx)"],
  reco_empty_hint: [
    "Nothing to compare yet. Upload a portal file and a books file above, or press Load sample data to see how it works.",
    "अभी तुलना के लिए कुछ नहीं है। ऊपर पोर्टल और बुक्स फ़ाइल अपलोड करें, या 'सैंपल डेटा' दबाकर देखें कि यह कैसे काम करता है।",
    "暂无可比对内容。请在上方上传门户文件和账簿文件，或点“加载示例数据”查看效果。",
    "Aún no hay nada que comparar. Suba un archivo del portal y uno de libros, o pulse Cargar datos de ejemplo.",
    "Rien à comparer pour l'instant. Chargez un fichier du portail et un fichier comptable, ou cliquez sur Charger des données d'exemple."
  ],
  err_reco_empty_file: ["No rows found in {name}.", "{name} में कोई पंक्ति नहीं मिली।", "{name} 中没有数据行。", "No se encontraron filas en {name}.", "Aucune ligne trouvée dans {name}."],
  err_reco_no_file: ["Choose a file first.", "पहले फ़ाइल चुनें।", "请先选择文件。", "Elija un archivo primero.", "Choisissez d'abord un fichier."],
  err_reco_no_invoice_col: [
    "Map the Invoice No column before importing - the reconciliation keys on it.",
    "आयात से पहले Invoice No कॉलम मैप करें - मिलान इसी पर होता है।",
    "导入前请先映射发票号列——核对以它为主键。",
    "Asigne la columna de número de factura antes de importar: la conciliación se basa en ella.",
    "Associez la colonne numéro de facture avant d'importer : le rapprochement s'appuie dessus."
  ],
  err_reco_import_first: [
    "Import both sides first - press the Import button under each file.",
    "पहले दोनों पक्ष आयात करें - हर फ़ाइल के नीचे Import दबाएँ।",
    "请先导入两侧数据——点击每个文件下方的导入按钮。",
    "Importe primero ambos lados: pulse Importar bajo cada archivo.",
    "Importez d'abord les deux côtés : cliquez sur Importer sous chaque fichier."
  ],
  mod_bank: ["Bank reco", "बैंक मिलान", "银行核对", "Conciliación bancaria", "Rapprochement bancaire"],
  mod_tds: ["TDS reco", "TDS मिलान", "TDS 核对", "Conciliación TDS", "Rapprochement TDS"],
  mod_stock: ["Stock reco", "स्टॉक मिलान", "库存核对", "Conciliación de inventario", "Rapprochement des stocks"],
  // ---- 2A/2B ----
  basis_label: ["GST 2A/2B period basis", "GST 2A/2B अवधि आधार", "GST 2A/2B 期间依据", "Base de período GST 2A/2B", "Base de période GST 2A/2B"],
  basis_both: [
    "Both (Invoice Date + Return Period)",
    "दोनों (इनवॉइस तारीख + रिटर्न अवधि)",
    "两者（发票日期 + 申报期间）",
    "Ambos (fecha de factura + período de declaración)",
    "Les deux (date de facture + période de déclaration)"
  ],
  basis_invoice: ["Invoice Date", "इनवॉइस तारीख", "发票日期", "Fecha de factura", "Date de facture"],
  basis_return: ["Return Period", "रिटर्न अवधि", "申报期间", "Período de declaración", "Période de déclaration"],
  basis_note: [
    "Invoice Date: both sides are filtered by invoice date. Return Period: portal side is filtered by return month, so older invoices filed in this period are included. Both: a row is kept if either test matches. The Books side always uses invoice date.",
    "इनवॉइस तारीख: दोनों ओर इनवॉइस तारीख से फ़िल्टर। रिटर्न अवधि: पोर्टल की ओर रिटर्न महीने से फ़िल्टर, ताकि इस अवधि में दाखिल पुरानी इनवॉइस भी आएँ। दोनों: जो भी मेल खाए। Books की ओर हमेशा इनवॉइस तारीख से फ़िल्टर।",
    "发票日期：两侧均按发票日期筛选。申报期间：门户一侧按申报月份筛选，因此本期间申报的旧发票也会包括在内。两者：任一条件符合即保留。Books 一侧始终按发票日期筛选。",
    "Fecha de factura: ambos lados se filtran por fecha de factura. Período de declaración: el lado del portal se filtra por mes de declaración, así se incluyen facturas antiguas presentadas en este período. Ambos: se conserva la fila si cumple cualquiera. El lado de Books siempre usa la fecha de factura.",
    "Date de facture : les deux côtés sont filtrés par date de facture. Période de déclaration : le côté portail est filtré par mois de déclaration, donc les anciennes factures déclarées sur cette période sont incluses. Les deux : une ligne est conservée si l'un des critères correspond. Le côté Books utilise toujours la date de facture."
  ],
  upload_gstr2: ["GSTR-2A / 2B (Excel)", "GSTR-2A / 2B (Excel)", "GSTR-2A / 2B（Excel）", "GSTR-2A / 2B (Excel)", "GSTR-2A / 2B (Excel)"],
  upload_books_purchase: ["Books purchase register (Excel)", "Books खरीद रजिस्टर (Excel)", "Books 采购登记册（Excel）", "Registro de compras de Books (Excel)", "Registre d'achats Books (Excel)"],
  run_gst2a: ["▶ Run GST 2A/2B reconciliation", "▶ GST 2A/2B मिलान चलाएँ", "▶ 运行 GST 2A/2B 核对", "▶ Ejecutar conciliación GST 2A/2B", "▶ Lancer le rapprochement GST 2A/2B"],
  err_gst2a_failed: ["2A/2B reconciliation failed: {error}", "2A/2B मिलान विफल: {error}", "2A/2B 核对失败：{error}", "Falló la conciliación 2A/2B: {error}", "Échec du rapprochement 2A/2B : {error}"],
  kpi_b2b_matched: ["B2B Matched", "B2B मेल खाए", "B2B 已匹配", "B2B conciliadas", "B2B rapprochées"],
  kpi_b2b_mismatch: ["B2B Mismatch", "B2B बेमेल", "B2B 不匹配", "B2B con diferencias", "B2B en écart"],
  kpi_only_2a_risk: ["Only in 2A (ITC risk)", "केवल 2A में (ITC जोखिम)", "仅在 2A 中（ITC 风险）", "Solo en 2A (riesgo de ITC)", "Seulement dans 2A (risque ITC)"],
  kpi_only_books: ["Only in Books", "केवल Books में", "仅在 Books 中", "Solo en Books", "Seulement dans Books"],
  kpi_only_portal: ["Only in Portal", "केवल पोर्टल में", "仅在门户中", "Solo en el portal", "Seulement sur le portail"],
  sub_taxable: ["Taxable {amount}", "कर योग्य {amount}", "应税额 {amount}", "Base imponible {amount}", "Base imposable {amount}"],
  sub_gstr1_not_books: ["In GSTR-1, not in Books", "GSTR-1 में, Books में नहीं", "在 GSTR-1 中，不在 Books 中", "En GSTR-1, no en Books", "Dans GSTR-1, pas dans Books"],
  sub_books_not_gstr1: ["In Books, not in GSTR-1", "Books में, GSTR-1 में नहीं", "在 Books 中，不在 GSTR-1 中", "En Books, no en GSTR-1", "Dans Books, pas dans GSTR-1"],
  note_gstr9: [
    "The GSTR-9 summary is built from the full Books file (annual). The period filter does not change it.",
    "GSTR-9 सारांश पूरी Books फ़ाइल से बनता है (वार्षिक)। अवधि फ़िल्टर इसे नहीं बदलता।",
    "GSTR-9 摘要基于完整的 Books 文件（年度）生成，期间筛选不会改变它。",
    "El resumen GSTR-9 se genera con todo el archivo de Books (anual). El filtro de período no lo modifica.",
    "Le résumé GSTR-9 est établi à partir du fichier Books complet (annuel). Le filtre de période ne le modifie pas."
  ],
  note_confirm: [
    "These notes did not match the portal. Choose CN or DN, save, then run again.",
    "ये नोट्स पोर्टल से मेल नहीं खाए। CN या DN चुनें, सेव करें, फिर दोबारा चलाएँ।",
    "这些票据与门户不匹配。请选择 CN 或 DN，保存后重新运行。",
    "Estas notas no coinciden con el portal. Elija NC o ND, guarde y vuelva a ejecutar.",
    "Ces notes ne correspondent pas au portail. Choisissez AC ou ND, enregistrez, puis relancez."
  ],
  btn_save_notes: ["Save note types", "नोट प्रकार सेव करें", "保存票据类型", "Guardar tipos de nota", "Enregistrer les types de note"],
  notes_saved: ["{n} note(s) saved. Run again.", "{n} नोट सेव हुए। दोबारा चलाएँ।", "已保存 {n} 张票据。请重新运行。", "{n} nota(s) guardada(s). Vuelva a ejecutar.", "{n} note(s) enregistrée(s). Relancez."],
  notes_all_confirmed: ["All note types are confirmed.", "सभी नोट प्रकार की पुष्टि हो चुकी है।", "所有票据类型均已确认。", "Todos los tipos de nota están confirmados.", "Tous les types de note sont confirmés."],
  download_gst2a: ["⬇️ Download GST 2A/2B report (.xlsx)", "⬇️ GST 2A/2B रिपोर्ट डाउनलोड करें (.xlsx)", "⬇️ 下载 GST 2A/2B 报告 (.xlsx)", "⬇️ Descargar informe GST 2A/2B (.xlsx)", "⬇️ Télécharger le rapport GST 2A/2B (.xlsx)"],

  // ---- GSTR-1 ----
  note_gstr1: [
    "Upload one or more GSTR-1 JSON (portal) files and the Books Excel. The period is read from the JSON itself. Use the period filter to choose a month, quarter, FY or custom range.",
    "एक या अधिक GSTR-1 JSON (पोर्टल) और Books Excel अपलोड करें। अवधि JSON के अंदर से अपने आप पढ़ी जाती है। महीना, तिमाही, FY या कस्टम अवधि चुनने के लिए अवधि फ़िल्टर का उपयोग करें।",
    "上传一个或多个 GSTR-1 JSON（门户）文件和 Books Excel。期间会自动从 JSON 中读取。可使用期间筛选选择月份、季度、财年或自定义范围。",
    "Suba uno o más archivos JSON de GSTR-1 (portal) y el Excel de Books. El período se lee del propio JSON. Use el filtro de período para elegir un mes, trimestre, año fiscal o rango personalizado.",
    "Chargez un ou plusieurs fichiers JSON GSTR-1 (portail) et le fichier Excel Books. La période est lue dans le JSON. Utilisez le filtre de période pour choisir un mois, un trimestre, un exercice ou une plage personnalisée."
  ],
  upload_gstr1_json: ["GSTR-1 portal files (JSON)", "GSTR-1 पोर्टल फ़ाइलें (JSON)", "GSTR-1 门户文件（JSON）", "Archivos del portal GSTR-1 (JSON)", "Fichiers portail GSTR-1 (JSON)"],
  upload_books_gstr1: ["Books GSTR-1 files (Excel, GST template)", "Books GSTR-1 फ़ाइलें (Excel, GST टेम्पलेट)", "Books GSTR-1 文件（Excel，GST 模板）", "Archivos GSTR-1 de Books (Excel, plantilla GST)", "Fichiers GSTR-1 Books (Excel, modèle GST)"],
  gstr1_3b_header: ["GSTR-3B values (enter for each month, from the PDF)", "GSTR-3B मान (हर महीने के लिए, PDF से भरें)", "GSTR-3B 数值（每月输入，取自 PDF）", "Valores GSTR-3B (ingrese cada mes, desde el PDF)", "Valeurs GSTR-3B (saisir chaque mois, depuis le PDF)"],
  run_gstr1: ["▶ Run GSTR-1 & GSTR-3B reconciliation", "▶ GSTR-1 और GSTR-3B मिलान चलाएँ", "▶ 运行 GSTR-1 与 GSTR-3B 核对", "▶ Ejecutar conciliación GSTR-1 y GSTR-3B", "▶ Lancer le rapprochement GSTR-1 et GSTR-3B"],
  err_gstr1_files: ["Upload both GSTR-1 JSON and Books Excel.", "GSTR-1 JSON और Books Excel, दोनों अपलोड करें।", "请同时上传 GSTR-1 JSON 和 Books Excel。", "Suba el JSON de GSTR-1 y el Excel de Books.", "Chargez le JSON GSTR-1 et le fichier Excel Books."],
  info_no_cdnr: ["No CDNR in this period", "इस अवधि में CDNR नहीं है", "本期间没有 CDNR", "No hay CDNR en este período", "Aucun CDNR sur cette période"],
  download_gstr1: ["⬇️ Download GSTR-1 & 3B report (.xlsx)", "⬇️ GSTR-1 और 3B रिपोर्ट डाउनलोड करें (.xlsx)", "⬇️ 下载 GSTR-1 与 3B 报告 (.xlsx)", "⬇️ Descargar informe GSTR-1 y 3B (.xlsx)", "⬇️ Télécharger le rapport GSTR-1 et 3B (.xlsx)"],
  no_cdnr_rows: ["No CDNR rows", "CDNR पंक्तियाँ नहीं", "没有 CDNR 行", "Sin filas CDNR", "Aucune ligne CDNR"],

  // ---- bank ----
  upload_bank_stmt: ["Bank statement (.xls / .xlsx)", "बैंक स्टेटमेंट (.xls / .xlsx)", "银行对账单（.xls / .xlsx）", "Extracto bancario (.xls / .xlsx)", "Relevé bancaire (.xls / .xlsx)"],
  upload_tally_bank: ["Tally bank ledger (Excel)", "Tally बैंक खाता (Excel)", "Tally 银行分类账（Excel）", "Libro bancario de Tally (Excel)", "Grand livre bancaire Tally (Excel)"],
  bank_caption_note: ["Opening balance is taken at the start of the period.", "आरंभिक शेष अवधि की शुरुआत पर लिया जाता है।", "期初余额取自期间开始时。", "El saldo inicial se toma al inicio del período.", "Le solde d'ouverture est pris au début de la période."],
  run_bank: ["▶ Run bank reconciliation", "▶ बैंक मिलान चलाएँ", "▶ 运行银行核对", "▶ Ejecutar conciliación bancaria", "▶ Lancer le rapprochement bancaire"],
  kpi_bank_matched: ["Matched", "मेल खाए", "已匹配", "Conciliadas", "Rapprochées"],
  kpi_books_not_bank: ["In Books, not in Bank", "Books में, बैंक में नहीं", "在 Books 中，不在银行中", "En Books, no en banco", "Dans Books, pas en banque"],
  kpi_bank_not_books: ["In Bank, not in Books", "बैंक में, Books में नहीं", "在银行中，不在 Books 中", "En banco, no en Books", "En banque, pas dans Books"],
  kpi_closing_diff: ["Closing difference", "समापन अंतर", "期末差额", "Diferencia de cierre", "Écart de clôture"],
  sub_amount_date: ["Amount and date match", "राशि और तारीख मेल खाए", "金额和日期匹配", "Coinciden importe y fecha", "Montant et date concordants"],
  sub_timing: ["Timing / uncleared", "समय का अंतर / बिना क्लियर", "时间差 / 未清算", "Diferencia temporal / no compensado", "Décalage / non compensé"],
  sub_entry_needed: ["Entry to be booked", "प्रविष्टि दर्ज करनी है", "需要入账", "Asiento por registrar", "Écriture à comptabiliser"],
  sub_unexplained: ["Unexplained", "अस्पष्ट", "无法解释", "Sin explicar", "Non expliqué"],
  download_bank: ["⬇️ Download bank reco (.xlsx)", "⬇️ बैंक मिलान डाउनलोड करें (.xlsx)", "⬇️ 下载银行核对 (.xlsx)", "⬇️ Descargar conciliación bancaria (.xlsx)", "⬇️ Télécharger le rapprochement bancaire (.xlsx)"],

  // ---- TDS ----
  upload_tally_tds: ["Tally TDS ledger (Excel)", "Tally TDS खाता (Excel)", "Tally TDS 分类账（Excel）", "Libro TDS de Tally (Excel)", "Grand livre TDS Tally (Excel)"],
  upload_ca_tds: ["CA TDS return (Excel)", "CA TDS रिटर्न (Excel)", "CA TDS 申报表（Excel）", "Declaración TDS del contador (Excel)", "Déclaration TDS du CA (Excel)"],
  tds_info: [
    "The TDS engine uses the date range you select. Quarterly return validation will be added in Phase 5.",
    "TDS इंजन आपकी चुनी हुई तारीख सीमा का उपयोग करता है। तिमाही रिटर्न सत्यापन Phase 5 में जुड़ेगा।",
    "TDS 引擎使用您选择的日期范围。季度申报验证将在第 5 阶段加入。",
    "El motor TDS usa el rango de fechas seleccionado. La validación trimestral se añadirá en la Fase 5.",
    "Le moteur TDS utilise la plage de dates choisie. La validation trimestrielle sera ajoutée en phase 5."
  ],
  run_tds: ["▶ Run TDS reconciliation", "▶ TDS मिलान चलाएँ", "▶ 运行 TDS 核对", "▶ Ejecutar conciliación TDS", "▶ Lancer le rapprochement TDS"],
  kpi_ca_tds_payable: ["CA TDS payable", "CA TDS देय", "CA TDS 应付", "TDS a pagar según contador", "TDS à payer selon le CA"],
  kpi_tally_tds: ["Tally TDS credited", "Tally TDS जमा", "Tally TDS 贷记", "TDS acreditado en Tally", "TDS crédité dans Tally"],
  kpi_difference: ["Difference", "अंतर", "差额", "Diferencia", "Écart"],
  kpi_ca_paid: ["CA paid", "CA ने भुगतान किया", "CA 已付", "Pagado según contador", "Payé selon le CA"],
  sub_period_total: ["Period total", "अवधि का कुल", "期间合计", "Total del período", "Total de la période"],
  sub_tds_credits: ["TDS-type credits", "TDS प्रकार की जमा", "TDS 类贷记", "Abonos tipo TDS", "Crédits de type TDS"],
  sub_tally_minus_ca: ["Tally minus CA", "Tally घटा CA", "Tally 减 CA", "Tally menos CA", "Tally moins CA"],
  download_tds: ["⬇️ Download TDS reco (.xlsx)", "⬇️ TDS मिलान डाउनलोड करें (.xlsx)", "⬇️ 下载 TDS 核对 (.xlsx)", "⬇️ Descargar conciliación TDS (.xlsx)", "⬇️ Télécharger le rapprochement TDS (.xlsx)"],

  // ---- stock ----
  stock_mode_label: ["Stock report type", "स्टॉक रिपोर्ट प्रकार", "库存报告类型", "Tipo de informe de inventario", "Type de rapport de stock"],
  stock_snapshot: ["Snapshot (as on date)", "स्नैपशॉट (तारीख तक)", "快照（截至日期）", "Instantánea (a la fecha)", "Instantané (à la date)"],
  stock_movement: ["Movement (period activity)", "मूवमेंट (अवधि की गतिविधि)", "变动（期间活动）", "Movimientos (actividad del período)", "Mouvements (activité de la période)"],
  stock_snapshot_info: [
    "The snapshot is treated as the as-on date {date}. Verify the source report date.",
    "स्नैपशॉट को {date} की तारीख तक माना जाएगा। स्रोत रिपोर्ट की तारीख जाँचें।",
    "快照将视为截至 {date} 的数据。请核实源报告日期。",
    "La instantánea se tratará como la fecha {date}. Verifique la fecha del informe de origen.",
    "L'instantané est traité comme à la date {date}. Vérifiez la date du rapport source."
  ],
  stock_movement_info: [
    "Opening + inward − outward is checked against closing, item by item. Upload the closing stock summary as well to cross-check the closing quantities.",
    "आरंभिक + आवक − जावक को हर आइटम के क्लोज़िंग से मिलाया जाता है। क्लोज़िंग मात्रा का क्रॉस-चेक करने के लिए क्लोज़िंग स्टॉक सारांश भी अपलोड करें।",
    "逐项核对 期初 + 入库 − 出库 与期末结存。同时上传期末库存汇总可交叉核对期末数量。",
    "Se compara inicial + entradas − salidas con el cierre, artículo por artículo. Suba también el resumen de stock de cierre para cotejar las cantidades.",
    "Ouverture + entrées − sorties est comparé à la clôture, article par article. Ajoutez le résumé du stock de clôture pour contrôler les quantités."
  ],
  run_stock: ["▶ Run stock check", "▶ स्टॉक जाँच चलाएँ", "▶ 运行库存检查", "▶ Ejecutar verificación de inventario", "▶ Lancer la vérification des stocks"],
  kpi_neg_stock: ["Negative stock items", "ऋणात्मक स्टॉक आइटम", "负库存项目", "Artículos con stock negativo", "Articles en stock négatif"],
  kpi_qty_no_value: ["Qty without value", "मात्रा बिना मूल्य", "有数量无价值", "Cantidad sin valor", "Quantité sans valeur"],
  kpi_tieout: ["Totals tie-out", "कुल मिलान", "合计核对", "Conciliación de totales", "Rapprochement des totaux"],
  kpi_items_checked: ["Items checked", "जाँचे गए आइटम", "已检查项目", "Artículos revisados", "Articles vérifiés"],
  sub_value: ["Value {amount}", "मूल्य {amount}", "价值 {amount}", "Valor {amount}", "Valeur {amount}"],
  sub_units: ["{n} units", "{n} इकाइयाँ", "{n} 个单位", "{n} unidades", "{n} unités"],
  sub_items_total: ["Items = grand total", "आइटम = कुल योग", "项目 = 总计", "Artículos = total general", "Articles = total général"],
  sub_see_summary: ["See Summary tab", "सारांश टैब देखें", "请查看摘要标签", "Vea la pestaña Resumen", "Voir l'onglet Résumé"],
  sub_stock_register: ["Stock register", "स्टॉक रजिस्टर", "库存登记册", "Registro de inventario", "Registre des stocks"],
  tied: ["Tied", "मिला", "已核对", "Conciliado", "Concordant"],
  not_tied: ["Not tied", "नहीं मिला", "未核对", "No conciliado", "Non concordant"],
  upload_tally_stock: ["Tally stock report (Excel)", "Tally स्टॉक रिपोर्ट (Excel)", "Tally 库存报告（Excel）", "Informe de inventario de Tally (Excel)", "Rapport de stock Tally (Excel)"],
  download_stock: ["⬇️ Download stock check (.xlsx)", "⬇️ स्टॉक जाँच डाउनलोड करें (.xlsx)", "⬇️ 下载库存检查 (.xlsx)", "⬇️ Descargar verificación de inventario (.xlsx)", "⬇️ Télécharger la vérification des stocks (.xlsx)"],

  // ---- sidebar / shared ----
  ui_language: ["Language / भाषा / 语言 / Idioma / Langue", "Language / भाषा / 语言 / Idioma / Langue", "Language / भाषा / 语言 / Idioma / Langue", "Language / भाषा / 语言 / Idioma / Langue", "Language / भाषा / 语言 / Idioma / Langue"],

  // ---- GSTR-3B PDF reader ----
  upload_3b_pdf: [
    "GSTR-3B PDF from the portal (optional - fills the grid below)",
    "पोर्टल की GSTR-3B PDF (वैकल्पिक - नीचे ग्रिड भर देती है)",
    "门户的 GSTR-3B PDF（可选，自动填入下方表格）",
    "PDF de GSTR-3B del portal (opcional, rellena la tabla)",
    "PDF GSTR-3B du portail (facultatif, remplit le tableau)"
  ],
  three_b_from_pdf: [
    "3B read from {n} PDF(s): {periods}",
    "3B {n} PDF से पढ़ा गया: {periods}",
    "已从 {n} 个 PDF 读取 3B：{periods}",
    "3B leído de {n} PDF: {periods}",
    "3B lu depuis {n} PDF : {periods}"
  ],

  // ---- stock movement ----
  upload_stock_movement: ["Tally stock movement register (Excel)", "Tally स्टॉक मूवमेंट रजिस्टर (Excel)", "Tally 库存变动登记表（Excel）", "Registro de movimientos de stock de Tally (Excel)", "Registre des mouvements de stock Tally (Excel)"],
  upload_stock_closing: ["Closing stock summary (optional cross-check)", "क्लोज़िंग स्टॉक सारांश (वैकल्पिक क्रॉस-चेक)", "期末库存汇总（可选交叉核对）", "Resumen de stock de cierre (cotejo opcional)", "Résumé du stock de clôture (contrôle facultatif)"],
  run_stock_movement: ["▶ Run stock movement reco", "▶ स्टॉक मूवमेंट मिलान चलाएँ", "▶ 运行库存变动核对", "▶ Ejecutar conciliación de movimientos", "▶ Lancer le rapprochement des mouvements"],
  download_stock_movement: ["⬇️ Download stock movement (.xlsx)", "⬇️ स्टॉक मूवमेंट डाउनलोड करें (.xlsx)", "⬇️ 下载库存变动 (.xlsx)", "⬇️ Descargar movimientos de stock (.xlsx)", "⬇️ Télécharger les mouvements de stock (.xlsx)"],
  kpi_stock_items: ["Items checked", "जाँचे गए आइटम", "已检查项目", "Artículos revisados", "Articles vérifiés"],
  kpi_movement_errors: ["Rows that do not tally", "जो पंक्तियाँ मेल नहीं खातीं", "不平的行", "Filas que no cuadran", "Lignes non concordantes"],
  kpi_neg_closing: ["Negative closing", "ऋणात्मक क्लोज़िंग", "负结存", "Cierre negativo", "Clôture négative"],
  kpi_crosscheck_diff: ["Differs from stock summary", "स्टॉक सारांश से भिन्न", "与库存汇总不一致", "Difiere del resumen de stock", "Diffère du résumé de stock"],
  sub_stock_movement: ["From the movement register", "मूवमेंट रजिस्टर से", "来自变动登记表", "Del registro de movimientos", "Du registre des mouvements"],
  sub_opening_inward_outward: ["opening + inward − outward", "आरंभिक + आवक − जावक", "期初 + 入库 − 出库", "inicial + entradas − salidas", "ouverture + entrées − sorties"],
  sub_neg_closing: ["Check issue entries", "जावक प्रविष्टियाँ जाँचें", "请检查出库记录", "Revise los registros de salida", "Vérifiez les sorties"],
  sub_crosscheck: ["Cross-check with closing file", "क्लोज़िंग फ़ाइल से क्रॉस-चेक", "与期末文件交叉核对", "Cotejo con el archivo de cierre", "Contrôle avec le fichier de clôture"],
  tab_stock_exceptions: ["Exceptions", "अपवाद", "异常", "Excepciones", "Exceptions"],
  info_no_exceptions: ["No exceptions found.", "कोई अपवाद नहीं मिला।", "未发现异常。", "No se encontraron excepciones.", "Aucune exception trouvée."],

  // ---- confirmed note types ----
  btn_download_notes: ["⬇️ Download confirmed types (.csv)", "⬇️ कन्फर्म किए गए टाइप डाउनलोड करें (.csv)", "⬇️ 下载已确认的类型 (.csv)", "⬇️ Descargar tipos confirmados (.csv)", "⬇️ Télécharger les types confirmés (.csv)"],
  upload_notes_csv: ["Load a saved confirmed-types CSV (optional)", "सेव की गई कन्फर्म्ड-टाइप CSV लोड करें (वैकल्पिक)", "加载已保存的确认类型 CSV（可选）", "Cargar un CSV de tipos confirmados (opcional)", "Charger un CSV de types confirmés (facultatif)"],
  notes_loaded: ["{n} rows loaded from {name}", "{name} से {n} पंक्तियाँ लोड हुईं", "已从 {name} 加载 {n} 行", "Se cargaron {n} filas de {name}", "{n} lignes chargées depuis {name}"],
  notes_session_only: [
    "Saved for this session only: local storage updated. Download the CSV to keep these confirmations.",
    "सिर्फ़ इस सत्र के लिए सेव हुआ। इन कन्फर्मेशन को रखने के लिए CSV डाउनलोड करें।",
    "仅在本次会话中保存。请下载 CSV 以保留这些确认。",
    "Guardado solo para esta sesión. Descargue el CSV para conservar las confirmaciones.",
    "Enregistré pour cette session uniquement. Téléchargez le CSV pour conserver ces confirmations."
  ],
  err_notes_csv: [
    "That file is not a confirmed-types CSV (needs GSTIN, Note No, Type, Basis).",
    "यह फ़ाइल कन्फर्म्ड-टाइप CSV नहीं है (GSTIN, Note No, Type, Basis चाहिए)।",
    "该文件不是确认类型 CSV（需要 GSTIN、Note No、Type、Basis）。",
    "Ese archivo no es un CSV de tipos confirmados (requiere GSTIN, Note No, Type, Basis).",
    "Ce fichier n'est pas un CSV de types confirmés (GSTIN, Note No, Type, Basis requis)."
  ]
};

const LANG_INDEX: Record<LanguageCode, number> = {
  en: 0,
  hi: 1,
  zh: 2,
  es: 3,
  fr: 4,
};

export function t(key: string, lang: LanguageCode = 'en', values?: Record<string, string | number>): string {
  const item = RAW_STRINGS[key];
  if (!item) {
    return key;
  }
  const idx = LANG_INDEX[lang] ?? 0;
  let text = item[idx] || item[0] || key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
