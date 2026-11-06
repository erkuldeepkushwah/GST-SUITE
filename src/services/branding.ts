export const FIRM_NAME = "Fingenuity Associates";
export const FIRM_TAGLINE = "Streamlining GST, Empowering Businesses, GST Compliance Made Simple.";
export const FIRM_LOCATION = "Indore, Madhya Pradesh";

/** Vite's base ('/' or '/GST-SUITE/') so the assets resolve on any host. */
const BASE = import.meta.env.BASE_URL || '/';

export const LOGO_PATH = `${BASE}assets/logo.png`;
export const SIDEBAR_BANNER_PATH = `${BASE}assets/logo_banner.png`;

/**
 * Password used to protect every downloaded Excel report.
 * Sheets are locked (read-only) so a report cannot be edited by accident or
 * silently changed after it has been shared. Change this value here only.
 */
export const REPORT_PASSWORD = 'Fingenuity@2026';
