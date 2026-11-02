"""Every local module the Streamlit app imports must also be imported by launcher.py.

The desktop build copies gst_suite_app.py as data, so PyInstaller only bundles modules that the
launcher imports. A module missing from the launcher gives 'ModuleNotFoundError' in the .exe.
"""
import ast
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def _imports(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as fh:
        tree = ast.parse(fh.read())
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module.split(".")[0])
    return found


class BundleTests(unittest.TestCase):
    def test_launcher_bundles_every_app_module(self):
        local = {f[:-3] for f in os.listdir(HERE) if f.endswith(".py")}
        app_needs = _imports("gst_suite_app.py") & local
        launcher_has = _imports("launcher.py") & local
        self.assertEqual(app_needs - launcher_has, set(),
                         "Add these to launcher.py so PyInstaller bundles them")


if __name__ == "__main__":
    unittest.main()
