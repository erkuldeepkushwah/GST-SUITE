export const FIRM_NAME = "Fingenuity Associates";
export const FIRM_TAGLINE = "Streamlining GST, Empowering Businesses, GST Compliance Made Simple.";
export const FIRM_LOCATION = "Indore, Madhya Pradesh";

/**
 * Vite's base ('/' or '/GST-SUITE/app/') so the assets resolve on any host.
 * The test scripts bundle this file for node, where import.meta.env does not
 * exist, hence the optional access.
 */
const BASE = ((import.meta as any).env?.BASE_URL as string) || '/';

export const LOGO_PATH = `${BASE}assets/logo.png`;
export const SIDEBAR_BANNER_PATH = `${BASE}assets/logo_banner.png`;

/**
 * Password used to protect every downloaded Excel report.
 * Sheets are locked (read-only) so a report cannot be edited by accident or
 * silently changed after it has been shared. Change this value here only.
 */
export const REPORT_PASSWORD = 'Fingenuity@2026';
