"""Download pinned, SHA-256 verified models with bounded HTTP range retries."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import time
import os
import httpx

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(row):
    destination = ROOT / "models" / row["folder"] / row["file"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and digest(destination) == row["sha256"]:
        print(f"Verified {row['folder']}/{row['file']}", flush=True)
        return
    endpoint = os.environ.get("HF_ENDPOINT", "https://huggingface.co").rstrip("/")
    urls = [f"{endpoint}/{row['repo']}/resolve/{row['revision']}/{row['file']}"]
    if row.get("fallback"):
        urls.append(row["fallback"])
    # A byte-identical mirror is safe only because the expected hash is pinned.
    if os.environ.get("LIME_JEV_PREFER_MIRROR") == "1":
        urls.reverse()
    size = row["size"]
    chunk_size = 8 * 1024 * 1024
    parts = destination.parent / ("." + destination.name + ".parts")
    parts.mkdir(exist_ok=True)

    def fetch_part(start):
        end = min(size, start + chunk_size) - 1
        part = parts / str(start)
        if part.exists() and part.stat().st_size == end - start + 1:
            return part
        for attempt in range(8):
            url = urls[min(attempt, len(urls) - 1)]
            temp = part.with_suffix(".tmp")
            resumed = temp.stat().st_size if temp.exists() else 0
            if resumed == end - start + 1:
                temp.replace(part)
                return part
            if resumed > end - start + 1:
                temp.unlink()
                resumed = 0
            offset = start + resumed
            try:
                with httpx.stream("GET", url, headers={"Range": f"bytes={offset}-{end}"}, follow_redirects=True, timeout=35) as response:
                    response.raise_for_status()
                    if (size > chunk_size or resumed) and (response.status_code != 206 or response.headers.get("content-range", "").split("/")[0] != f"bytes {offset}-{end}"):
                        raise ValueError("Server did not honor the requested byte range")
                    count = resumed
                    with temp.open("ab" if resumed else "wb") as file:
                        for block in response.iter_bytes(64 * 1024):
                            count += len(block)
                            if count > end - start + 1:
                                raise ValueError("Oversized download")
                            file.write(block)
                    if count != end - start + 1:
                        raise ValueError("Incomplete download")
                    temp.replace(part)
                    return part
            except (httpx.HTTPError, ValueError):
                if attempt == 7:
                    raise RuntimeError(f"Download failed: {row['file']} at byte {start}. Re-run install to resume.") from None
                time.sleep(1 + attempt)

    starts = list(range(0, size, chunk_size))
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(fetch_part, start) for start in starts]
        for i, future in enumerate(as_completed(futures), 1):
            future.result()
            if len(starts) > 1:
                print(f"Downloading {row['folder']}/{row['file']}: {i}/{len(starts)}", flush=True)
    temp = destination.with_suffix(destination.suffix + ".download")
    with temp.open("wb") as output:
        for start in starts:
            with (parts / str(start)).open("rb") as source:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    output.write(block)
    if digest(temp) != row["sha256"]:
        # Corrupt cached chunks must not make every subsequent retry fail forever.
        for part in parts.iterdir():
            part.unlink()
        temp.unlink()
        raise RuntimeError(f"SHA-256 mismatch: {row['file']}; corrupt partial files cleared. Retry install.")
    temp.replace(destination)
    for part in parts.iterdir():
        part.unlink()
    parts.rmdir()
    print(f"Verified {row['folder']}/{row['file']}", flush=True)


if __name__ == "__main__":
    rows = json.loads((ROOT / "scripts/models.json").read_text())
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(download, rows))
