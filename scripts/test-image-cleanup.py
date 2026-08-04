#!/usr/bin/env python3
"""One-shot OpenAI image cleanup experiment.

This script is deliberately separate from the web application. It sends one image-edit
request, saves the raw PNG plus a JSON report, and never persists the API key.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


API_URL = "https://api.openai.com/v1/images/edits"
DEFAULT_MODEL = "gpt-image-2"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "output" / "image-api-tests"
DEFAULT_PROMPT = """Edit the supplied product photograph into a clean archival catalogue photo of the exact same physical collectible toy. Treat the uploaded photograph as the only source of truth.

Remove the original background, display surface, stand, supports, neighboring objects, reflections, and cast shadows. Preserve every visible molded component, printed mark, color, proportion, asymmetry, surface finish, wear mark, transparent part, and textile element. Do not redesign, substitute, idealize, mirror, or invent any part or decoration.

If the toy already faces forward, preserve its orientation. If it is moderately rotated, normalize it to a natural front-facing catalogue view. Limited reconstruction of partially hidden geometry is permitted only when it can be reliably inferred from visible parts of this same photograph. If an area cannot be inferred reliably, preserve the closest authentic orientation.

Use soft, neutral, diffuse product lighting and realistic material texture. Center the complete toy upright in a square composition. The toy should occupy approximately 88 percent of the canvas height, with its lowest point approximately 7 percent above the bottom edge. Keep all accessories fully visible.

Place the isolated toy against a perfectly flat, uniform solid #00ff00 chroma-key background for later removal. Do not use #00ff00 in the toy. Do not include a floor plane, gradient, background texture, cast shadow, contact shadow, reflection, text, or watermark. Keep clean edges without halos, streaks, duplicated parts, clipped elements, excessive smoothing, CGI styling, illustration, or invented details."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send exactly one toy-photo cleanup request to the OpenAI Images API."
    )
    parser.add_argument("--image", required=True, type=Path, help="Source PNG, JPEG, or WebP")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for the raw output and JSON report",
    )
    parser.add_argument("--prompt-file", type=Path, help="Optional UTF-8 prompt override")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--quality", choices=("low", "medium", "high", "auto"), default="low")
    parser.add_argument("--moderation", choices=("auto", "low"), default="low")
    parser.add_argument("--size", default="1024x1024", help="API output size; default is 1024x1024")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print settings without an API call")
    return parser.parse_args()


def multipart_body(fields: dict[str, str], image_path: Path) -> tuple[bytes, str]:
    boundary = f"----collector-{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )

    mime = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="image"; filename="{image_path.name}"\r\n'.encode(),
            f"Content-Type: {mime}\r\n\r\n".encode(),
            image_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return b"".join(chunks), boundary


def request_id(headers) -> str | None:
    for name in ("x-request-id", "request-id", "openai-request-id"):
        value = headers.get(name)
        if value:
            return value
    return None


def write_report(path: Path, report: dict) -> None:
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    args = parse_args()
    image_path = args.image.expanduser().resolve()
    if not image_path.is_file():
        print(f"Image not found: {image_path}", file=sys.stderr)
        return 2

    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    if image_path.suffix.lower() not in allowed:
        print("Image must be PNG, JPEG, or WebP.", file=sys.stderr)
        return 2

    prompt = DEFAULT_PROMPT
    if args.prompt_file:
        prompt = args.prompt_file.expanduser().read_text(encoding="utf-8").strip()
    if not prompt:
        print("Prompt is empty.", file=sys.stderr)
        return 2

    fields = {
        "model": args.model,
        "prompt": prompt,
        "quality": args.quality,
        "size": args.size,
        "moderation": args.moderation,
        "output_format": "png",
        "n": "1",
    }

    output_dir = args.output_dir.expanduser().resolve()

    summary = {
        "endpoint": API_URL,
        "image": str(image_path),
        "image_bytes": image_path.stat().st_size,
        "model": args.model,
        "quality": args.quality,
        "moderation": args.moderation,
        "size": args.size,
        "requests": 1,
        "prompt_characters": len(prompt),
        "output_dir": str(output_dir),
    }

    if args.dry_run:
        print(json.dumps({**summary, "dry_run": True}, indent=2))
        return 0

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print(
            "OPENAI_API_KEY is not set. Set it in your environment; do not paste it into this script.",
            file=sys.stderr,
        )
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    output_png = output_dir / f"cleanup-{stamp}-raw.png"
    report_path = output_dir / f"cleanup-{stamp}-report.json"

    body, boundary = multipart_body(fields, image_path)
    request = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
            "User-Agent": "custom-figures-collector-image-test/1.0",
        },
    )

    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            response_body = response.read()
            rid = request_id(response.headers)
            payload = json.loads(response_body)
    except urllib.error.HTTPError as exc:
        elapsed = round(time.monotonic() - started, 2)
        raw_error = exc.read().decode("utf-8", errors="replace")
        try:
            error_payload = json.loads(raw_error)
        except json.JSONDecodeError:
            error_payload = {"raw": raw_error[:4000]}
        report = {
            **summary,
            "ok": False,
            "http_status": exc.code,
            "elapsed_seconds": elapsed,
            "request_id": request_id(exc.headers),
            "error": error_payload,
        }
        write_report(report_path, report)
        print(f"Request failed. Report: {report_path}", file=sys.stderr)
        if report["request_id"]:
            print(f"OpenAI request ID: {report['request_id']}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError) as exc:
        report = {
            **summary,
            "ok": False,
            "elapsed_seconds": round(time.monotonic() - started, 2),
            "error": {"type": type(exc).__name__, "message": str(exc)},
        }
        write_report(report_path, report)
        print(f"Network request failed. Report: {report_path}", file=sys.stderr)
        return 1

    elapsed = round(time.monotonic() - started, 2)
    images = payload.get("data") or []
    encoded = images[0].get("b64_json") if images else None
    if not encoded:
        report = {
            **summary,
            "ok": False,
            "elapsed_seconds": elapsed,
            "request_id": rid,
            "error": {"message": "The API response did not contain data[0].b64_json."},
            "response_keys": sorted(payload.keys()),
        }
        write_report(report_path, report)
        print(f"Unexpected API response. Report: {report_path}", file=sys.stderr)
        return 1

    output_png.write_bytes(base64.b64decode(encoded))
    report = {
        **summary,
        "ok": True,
        "elapsed_seconds": elapsed,
        "request_id": rid,
        "output": str(output_png),
        "output_bytes": output_png.stat().st_size,
        "usage": payload.get("usage"),
    }
    write_report(report_path, report)
    print(f"Image:  {output_png}")
    print(f"Report: {report_path}")
    if rid:
        print(f"OpenAI request ID: {rid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
