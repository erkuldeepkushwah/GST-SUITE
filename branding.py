"""Branding helpers: one logo file used by the app, the desktop build and the Excel reports."""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))

# Firm details. Change them here only; the app header, sidebar and Excel reports read from this.
FIRM_NAME = "Fingenuity Associates"
FIRM_TAGLINE = "Streamlining GST, Empowering Businesses, GST Compliance Made Simple."
FIRM_LOCATION = "Indore, Madhya Pradesh"


def logo_path():
    """Path to assets/logo.png, for source runs and for the PyInstaller bundle."""
    candidates = []
    if getattr(sys, "_MEIPASS", None):
        candidates.append(os.path.join(sys._MEIPASS, "assets", "logo.png"))
    candidates.append(os.path.join(_HERE, "assets", "logo.png"))
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def sidebar_banner_path():
    """Logo with the firm name beside it, for the sidebar. Falls back to the plain logo."""
    candidates = []
    if getattr(sys, "_MEIPASS", None):
        candidates.append(os.path.join(sys._MEIPASS, "assets", "logo_banner.png"))
    candidates.append(os.path.join(_HERE, "assets", "logo_banner.png"))
    for p in candidates:
        if os.path.exists(p):
            return p
    return logo_path()
