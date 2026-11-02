"""Desktop launcher for GST Reconciliation.

Starts the Streamlit app as a local child process (127.0.0.1 only) and opens it
in a native window with pywebview. No browser is needed.

Dev run:      python launcher.py
Frozen (exe): the same file, packaged with PyInstaller (see build_windows.bat).
"""
import os
import socket
import subprocess
import sys
import time
import urllib.request

# Imported here so PyInstaller bundles them. The Streamlit script imports them at runtime.
import pandas  # noqa: F401
import openpyxl  # noqa: F401
import xlrd  # noqa: F401  (bank statements in .xls)
import pypdf  # noqa: F401  (GSTR-3B PDF reader)
import reco_core  # noqa: F401
import gst_phase1  # noqa: F401
import gstr9  # noqa: F401
import gstr1_reco  # noqa: F401
import gstr1_multi  # noqa: F401
import period_manager  # noqa: F401
import gstr1_report  # noqa: F401
import bank_reco  # noqa: F401
import tds_reco  # noqa: F401
import stock_reco  # noqa: F401
import stock_movement  # noqa: F401
import gstr3b_pdf  # noqa: F401
import branding  # noqa: F401
import i18n  # noqa: F401  (used by gst_suite_app.py; must be bundled)

from branding import FIRM_NAME  # noqa: E402

APP_NAME = f"GST Reconciliation | {FIRM_NAME}"


def resource_path(rel):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


def data_dir():
    folder = os.path.join(os.path.expanduser("~"), "Documents", "GST Reco")
    os.makedirs(folder, exist_ok=True)
    return folder


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def run_server(script, port):
    """Runs inside the child process. Blocks until the app is closed."""
    from streamlit.web import bootstrap
    flags = {
        "server.port": port,
        "server.address": "127.0.0.1",
        "server.headless": True,
        "browser.gatherUsageStats": False,
        "global.developmentMode": False,
    }
    # The Streamlit CLI calls load_config_options before run(); do the same here, or the port is ignored.
    bootstrap.load_config_options(flag_options=flags)
    bootstrap.run(script, False, [], flags)


def wait_until_ready(url, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url + "/_stcore/health", timeout=2) as r:
                if r.read().decode().strip() == "ok":
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def main():
    if "--run-server" in sys.argv:
        i = sys.argv.index("--run-server")
        run_server(sys.argv[i + 1], int(sys.argv[i + 2]))
        return

    os.environ["GST_RECO_DATA_DIR"] = data_dir()
    port = free_port()
    script = resource_path("gst_suite_app.py")
    if getattr(sys, "frozen", False):
        cmd = [sys.executable, "--run-server", script, str(port)]
    else:
        cmd = [sys.executable, os.path.abspath(__file__), "--run-server", script, str(port)]
    # Windowed builds have no console, so send the server's output to a log file.
    # CREATE_NO_WINDOW stops the child from opening its own console window.
    log_path = os.path.join(data_dir(), "app.log")
    log_file = open(log_path, "a", encoding="utf-8", errors="replace")
    creation = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
    child = subprocess.Popen(cmd, env=os.environ.copy(), stdout=log_file,
                             stderr=subprocess.STDOUT, creationflags=creation)

    url = f"http://127.0.0.1:{port}"
    try:
        if not wait_until_ready(url):
            raise RuntimeError("Streamlit server start nahi hua. Logs check karein.")
        import webview
        # pywebview blocks file downloads by default (ALLOW_DOWNLOADS=False), so the Excel
        # report buttons would silently do nothing. Allow them; the user then gets a Save As dialog.
        webview.settings["ALLOW_DOWNLOADS"] = True
        webview.create_window(APP_NAME, url, width=1280, height=860, min_size=(1000, 700))
        webview.start()
    finally:
        child.terminate()
        log_file.close()


if __name__ == "__main__":
    main()
