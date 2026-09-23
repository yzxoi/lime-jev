"""Manage local services and an additive, reversible Squirrel installation."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
RIME = Path.home() / "Library/Rime"
AGENTS = Path.home() / "Library/LaunchAgents"
URL = "http://127.0.0.1:17864"
LABELS = ["io.github.lime-jev.worker", "io.github.lime-jev.app", "io.github.lime-jev.focus"]
DOMAIN = f"gui/{os.getuid()}"


def setup():
    RUNTIME.mkdir(exist_ok=True, mode=0o700)
    RUNTIME.chmod(0o700)
    token = RUNTIME / "token"
    if not token.exists():
        token.write_text(secrets.token_urlsafe(32))
    token.chmod(0o600)


def api(path, body=None):
    request = Request(URL + path, data=None if body is None else json.dumps(body).encode(),
                      headers={"Authorization": "Bearer " + (RUNTIME / "token").read_text().strip(),
                               "Content-Type": "application/json"})
    with urlopen(request, timeout=3) as response:
        return json.load(response)


def squirrel():
    for base in [Path("/Library/Input Methods"), Path.home() / "Library/Input Methods"]:
        app = base / "Squirrel.app"
        if app.exists():
            return app
    return None


def reload_rime():
    app = squirrel()
    if app:
        subprocess.run([str(app / "Contents/MacOS/Squirrel"), "--reload"], check=True)


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def install_rime():
    import yaml
    if not squirrel():
        raise RuntimeError("Install Squirrel first: brew install --cask squirrel. Add it in System Settings → Keyboard → Input Sources, then rerun install.")
    setup()
    RIME.mkdir(parents=True, exist_ok=True)
    (RIME / "lua").mkdir(exist_ok=True)
    backup = RUNTIME / "rime-backup"
    backup.mkdir(exist_ok=True)
    manifest_path = backup / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    files = {
        "lime_jev.schema.yaml": (ROOT / "rime/lime_jev.schema.yaml").read_bytes(),
        "lua/lime_jev.lua": (ROOT / "rime/lua/lime_jev.lua").read_bytes(),
        "lua/lime_jev_json.lua": (ROOT / "rime/lua/json.lua").read_bytes(),
        "lua/lime_jev_config.lua": ("return {url=" + json.dumps(URL) + ", token=" + json.dumps((RUNTIME / "token").read_text().strip()) + "}\n").encode(),
    }
    custom = RIME / "default.custom.yaml"
    data = yaml.safe_load(custom.read_text()) if custom.exists() else {}
    if data is None:
        data = {}
    if not isinstance(data, dict) or not isinstance(data.get("patch", {}), dict):
        raise RuntimeError("default.custom.yaml uses an unsupported structure; existing file was not changed.")
    patch = data.setdefault("patch", {})
    key = "schema_list" if isinstance(patch.get("schema_list"), list) else "schema_list/+"
    schemas = patch.setdefault(key, [])
    if not isinstance(schemas, list):
        raise RuntimeError("schema_list patch must be a list; existing file was not changed.")
    if not any(isinstance(s, dict) and s.get("schema") == "lime_jev" for s in schemas):
        schemas.append({"schema": "lime_jev"})
    files["default.custom.yaml"] = yaml.safe_dump(data, allow_unicode=True, sort_keys=False).encode()
    for name, content in files.items():
        destination = RIME / name
        if name not in manifest:
            original = backup / name
            original.parent.mkdir(parents=True, exist_ok=True)
            existed = destination.exists()
            if existed:
                shutil.copy2(destination, original)
            manifest[name] = {"existed": existed}
        destination.write_bytes(content)
        if name.endswith("config.lua"):
            destination.chmod(0o600)
        manifest[name]["installed_sha256"] = hash_file(destination)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    reload_rime()
    print("Installed additional Rime schema: Lime · 本地语境. Existing settings are backed up locally.")


def deno_path():
    saved = RUNTIME / "deno-path"
    choices = [saved.read_text().strip() if saved.exists() else "", shutil.which("deno"), str(ROOT / ".tools/node_modules/.bin/deno")]
    for choice in choices:
        if choice and os.access(choice, os.X_OK):
            return str(Path(choice).absolute())
    raise RuntimeError("Deno is missing; rerun ./lime-jev install.")


def stop():
    for label in LABELS:
        subprocess.run(["launchctl", "bootout", f"{DOMAIN}/{label}"], capture_output=True)
        (AGENTS / f"{label}.plist").unlink(missing_ok=True)
    print("Background services stopped. Run ./lime-jev start to enable them again.")


def start():
    setup()
    for model in [ROOT / "models/laya/model.safetensors", ROOT / "models/lime/Qwen3-0.6B-IQ4_XS.gguf"]:
        if not model.exists():
            raise RuntimeError("Models are missing; run ./lime-jev install.")
    stop()
    AGENTS.mkdir(parents=True, exist_ok=True)
    commands = [
        [str(ROOT / ".venv/bin/python"), "-m", "worker.server"],
        [deno_path(), "run", "--allow-read", "--allow-write=.runtime", "--allow-env", "--allow-net=127.0.0.1,localhost", "--allow-ffi", "--allow-sys", "--allow-run", "app/server.ts"],
        [str(RUNTIME / "focuswatch"), URL + "/focus", str(RUNTIME / "token")],
    ]
    for label, args in zip(LABELS, commands):
        name = label.rsplit(".", 1)[-1]
        config = {"Label": label, "ProgramArguments": args, "WorkingDirectory": str(ROOT),
                  "RunAtLoad": True, "KeepAlive": {"SuccessfulExit": False}, "ThrottleInterval": 10,
                  "ProcessType": "Interactive", "StandardOutPath": str(RUNTIME / f"{name}.log"),
                  "StandardErrorPath": str(RUNTIME / f"{name}.log"),
                  "EnvironmentVariables": {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                                           "HF_HUB_OFFLINE": "1", "TOKENIZERS_PARALLELISM": "false", "PYTHONUNBUFFERED": "1"}}
        plist = AGENTS / f"{label}.plist"
        plist.write_bytes(plistlib.dumps(config))
        subprocess.run(["launchctl", "bootstrap", DOMAIN, str(plist)], check=True)
    for _ in range(90):
        try:
            status = api("/api/status")
            if status.get("worker", {}).get("ready"):
                print("lime-jev is ready. Services will also start at login.")
                return
        except (URLError, OSError, TimeoutError):
            pass
        time.sleep(1)
    raise RuntimeError("Startup took too long. Run ./lime-jev logs for details; ./lime-jev stop stops all services.")


def uninstall():
    import yaml
    stop()
    backup = RUNTIME / "rime-backup"
    manifest_file = backup / "manifest.json"
    if manifest_file.exists():
        manifest = json.loads(manifest_file.read_text())
        for name, item in manifest.items():
            destination = RIME / name
            if hash_file(destination) == item["installed_sha256"]:
                if item["existed"]:
                    shutil.copy2(backup / name, destination)
                else:
                    destination.unlink(missing_ok=True)
            elif name == "default.custom.yaml" and destination.exists():
                data = yaml.safe_load(destination.read_text()) or {}
                patch = data.get("patch", {})
                for key in ["schema_list", "schema_list/+"]:
                    if isinstance(patch.get(key), list):
                        patch[key] = [s for s in patch[key] if not (isinstance(s, dict) and s.get("schema") == "lime_jev")]
                destination.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
            else:
                print(f"Preserved modified file: {destination}")
        manifest_file.rename(backup / f"uninstalled-{int(time.time())}.json")
    reload_rime()
    print("Rime integration removed. Downloaded models and backups remain in this project directory.")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "help"
    if command in {"start", "restart"}:
        start()
    elif command == "stop":
        stop()
    elif command == "install-rime":
        install_rime()
    elif command == "uninstall":
        uninstall()
    elif command == "open":
        api("/health")
        subprocess.run(["open", URL + "/#token=" + (RUNTIME / "token").read_text().strip()], check=True)
    elif command == "use":
        if len(sys.argv) != 3 or sys.argv[2] not in {"lime", "laya"}:
            raise RuntimeError("Usage: ./lime-jev use {lime|laya}")
        backend = "off" if sys.argv[2] == "lime" else "laya"
        try:
            result = api("/api/settings", {"backend": backend})
        except (URLError, OSError, TimeoutError) as error:
            raise RuntimeError("Service unavailable. Run ./lime-jev start, then retry.") from error
        if not result.get("ok") or result.get("backend") != backend:
            raise RuntimeError("The service did not confirm the candidate strategy.")
        print("Candidate strategy:", "lime 语境词组（推荐，Laya 重排已关闭）" if backend == "off" else "Laya 重排（实验）")
        print("Saved and applied immediately. In Squirrel, select Lime · 本地语境 (lime_jev).")
    elif command in {"status", "doctor"}:
        try:
            status = api("/api/status")
            print(json.dumps(status, ensure_ascii=False, indent=2))
        except (URLError, OSError, TimeoutError):
            print("Services are not ready. Run ./lime-jev start or ./lime-jev logs.")
            sys.exit(1)
        print("Candidate strategy:", {"off": "lime 语境词组（推荐，Laya 重排已关闭）", "laya": "Laya 重排（实验）"}.get(status.get("backend"), "unknown"))
        print("Rime schema:", "built" if (RIME / "build/lime_jev.schema.yaml").exists() else "not deployed")
        import yaml
        try:
            user = yaml.safe_load((RIME / "user.yaml").read_text()) or {}
            selected = user.get("var", {}).get("previously_selected_schema", "unknown")
        except (OSError, yaml.YAMLError, AttributeError):
            selected = "unknown"
        print("Rime remembered schema:", selected, "(saved preference, not a live application check)")
    elif command == "logs":
        for name in ["app", "worker", "focus"]:
            path = RUNTIME / f"{name}.log"
            print(f"\n{name}:")
            if path.exists():
                print("\n".join(path.read_text(errors="replace").splitlines()[-30:]))
    else:
        print("Usage: ./lime-jev {install|start|stop|restart|status|doctor|open|logs|uninstall|use lime|use laya}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, URLError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
