#!/usr/bin/env python3
"""One-shot Stability AI background-removal experiment.

The script sends exactly one request, stores the transparent API output and a JSON
report, and optionally creates the 1254 x 1254 catalogue canvas when Pillow is
available. The API key is read only from STABILITY_API_KEY.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


API_URL = "https://api.stability.ai/v2beta/stable-image/edit/remove-background"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "output" / "stability-background-tests"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove one photo background using Stability AI and prepare a catalogue canvas."
    )
    parser.add_argument("--image", required=True, type=Path, help="Source PNG, JPEG, or WebP")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--dry-run", action="store_true", help="Validate settings without an API call")
    parser.add_argument(
        "--skip-catalog",
        action="store_true",
        help="Save only the transparent API result and skip 1254 x 1254 formatting",
    )
    return parser.parse_args()


def multipart_body(image_path: Path) -> tuple[bytes, str]:
    boundary = f"----collector-{uuid.uuid4().hex}"
    mime = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    chunks = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="output_format"\r\n\r\n',
        b"png\r\n",
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="image"; filename="{image_path.name}"\r\n'.encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        image_path.read_bytes(),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), boundary


def request_id(headers) -> str | None:
    for name in ("x-request-id", "request-id", "stability-request-id"):
        value = headers.get(name)
        if value:
            return value
    return None


def save_report(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def create_catalogue_png(source: Path, destination: Path) -> dict:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "Pillow is not installed. The transparent API result was saved, but the "
            "1254 x 1254 catalogue image was not created. Install it with: "
            "python -m pip install --user pillow"
        ) from exc

    with Image.open(source) as opened:
        image = opened.convert("RGBA")
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError("The API result contains no visible foreground pixels.")

    subject = image.crop(bounds)
    canvas_size = 1254
    target_height = round(canvas_size * 0.88)
    bottom_margin = 85
    side_margin = 55
    max_width = canvas_size - (side_margin * 2)
    scale = min(target_height / subject.height, max_width / subject.width)
    new_size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(new_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    x = (canvas_size - subject.width) // 2
    y = canvas_size - bottom_margin - subject.height
    if y < 0:
        y = 0
    canvas.alpha_composite(subject, (x, y))
    canvas.save(destination, "PNG", optimize=True)
    return {
        "canvas": [canvas_size, canvas_size],
        "subject_bounds_original": list(bounds),
        "subject_size": list(new_size),
        "subject_position": [x, y],
        "bottom_margin": canvas_size - (y + subject.height),
    }


def main() -> int:
    args = parse_args()
    image_path = args.image.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not image_path.is_file():
        print(f"Image not found: {image_path}", file=sys.stderr)
        return 2
    if image_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        print("Image must be PNG, JPEG, or WebP.", file=sys.stderr)
        return 2

    summary = {
        "endpoint": API_URL,
        "image": str(image_path),
        "image_bytes": image_path.stat().st_size,
        "output_dir": str(output_dir),
        "requests": 1,
        "service": "remove-background",
        "expected_success_cost_credits": 5,
    }
    if args.dry_run:
        print(json.dumps({**summary, "dry_run": True}, indent=2))
        return 0

    api_key = os.environ.get("STABILITY_API_KEY", "").strip()
    if not api_key:
        print(
            "STABILITY_API_KEY is not set. Set it in the current PowerShell window; "
            "do not paste it into this script or chat.",
            file=sys.stderr,
        )
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    raw_path = output_dir / f"background-{stamp}-raw.png"
    catalog_path = output_dir / f"background-{stamp}-catalog.png"
    report_path = output_dir / f"background-{stamp}-report.json"

    body, boundary = multipart_body(image_path)
    request = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "image/*",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "stability-client-id": "custom-figures-collector",
            "stability-client-version": "test-1.0",
            "User-Agent": "custom-figures-collector-background-test/1.0",
        },
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            result = response.read()
            rid = request_id(response.headers)
            content_type = response.headers.get("content-type")
    except urllib.error.HTTPError as exc:
        raw_error = exc.read().decode("utf-8", errors="replace")
        try:
            error = json.loads(raw_error)
        except json.JSONDecodeError:
            error = {"raw": raw_error[:4000]}
        report = {
            **summary,
            "ok": False,
            "http_status": exc.code,
            "elapsed_seconds": round(time.monotonic() - started, 2),
            "request_id": request_id(exc.headers),
            "error": error,
        }
        save_report(report_path, report)
        print(f"Request failed. Report: {report_path}", file=sys.stderr)
        if report["request_id"]:
            print(f"Stability request ID: {report['request_id']}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError) as exc:
        report = {
            **summary,
            "ok": False,
            "elapsed_seconds": round(time.monotonic() - started, 2),
            "error": {"type": type(exc).__name__, "message": str(exc)},
        }
        save_report(report_path, report)
        print(f"Network request failed. Report: {report_path}", file=sys.stderr)
        return 1

    raw_path.write_bytes(result)
    report = {
        **summary,
        "ok": True,
        "http_status": 200,
        "elapsed_seconds": round(time.monotonic() - started, 2),
        "request_id": rid,
        "content_type": content_type,
        "raw_output": str(raw_path),
        "raw_output_bytes": raw_path.stat().st_size,
    }

    if not args.skip_catalog:
        try:
            report["catalogue_format"] = create_catalogue_png(raw_path, catalog_path)
            report["catalogue_output"] = str(catalog_path)
            report["catalogue_output_bytes"] = catalog_path.stat().st_size
        except RuntimeError as exc:
            report["catalogue_warning"] = str(exc)

    save_report(report_path, report)
    print(f"Transparent result: {raw_path}")
    if report.get("catalogue_output"):
        print(f"Catalogue result:   {catalog_path}")
    elif report.get("catalogue_warning"):
        print(report["catalogue_warning"], file=sys.stderr)
    print(f"Report:             {report_path}")
    if rid:
        print(f"Stability request ID: {rid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
