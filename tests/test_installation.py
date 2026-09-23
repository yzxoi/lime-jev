import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import yaml

spec = importlib.util.spec_from_file_location("manage", Path(__file__).resolve().parents[1] / "scripts/manage.py")
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class InstallationTests(unittest.TestCase):
    def test_install_is_additive_idempotent_and_restores_exact_original(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rime = root / "Rime"
            rime.mkdir()
            original = '# personal comment\npatch:\n  "menu/page_size": 9\n  schema_list:\n    - schema: existing\n'
            custom = rime / "default.custom.yaml"
            custom.write_text(original)
            with patch.multiple(manage, RIME=rime, RUNTIME=root / "runtime"), patch.object(manage, "squirrel", return_value=Path("/fake/Squirrel.app")), patch.object(manage, "reload_rime"), patch.object(manage, "stop"):
                manage.install_rime()
                manage.install_rime()
                result = yaml.safe_load(custom.read_text())["patch"]
                self.assertEqual(result["schema_list"], [{"schema": "existing"}, {"schema": "lime_jev"}])
                self.assertEqual(result["menu/page_size"], 9)
                manage.uninstall()
                self.assertEqual(custom.read_text(), original)
                self.assertFalse((rime / "lime_jev.schema.yaml").exists())

    def test_uninstall_preserves_settings_edited_after_install(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.multiple(manage, RIME=root / "Rime", RUNTIME=root / "runtime"), patch.object(manage, "squirrel", return_value=Path("/fake/Squirrel.app")), patch.object(manage, "reload_rime"), patch.object(manage, "stop"):
                manage.install_rime()
                custom = manage.RIME / "default.custom.yaml"
                data = yaml.safe_load(custom.read_text())
                data["patch"]["menu/page_size"] = 7
                custom.write_text(yaml.safe_dump(data))
                manage.uninstall()
                data = yaml.safe_load(custom.read_text())
                self.assertEqual(data["patch"]["menu/page_size"], 7)
                self.assertEqual(data["patch"]["schema_list/+"], [])


if __name__ == "__main__":
    unittest.main()
