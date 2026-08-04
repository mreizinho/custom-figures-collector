# Image cleanup API test

This is an isolated, one-request test harness. It does not modify or connect to the web application.

## Safety and cost controls

- Each invocation makes at most one image-edit request.
- The default quality is `low` and the default size is `1024x1024`.
- `--dry-run` makes no network request and incurs no API cost.
- The API key is read only from `OPENAI_API_KEY`; it is never stored or printed.
- Generated images and JSON reports are written to the ignored `output/image-api-tests/` directory.
- Moderation failures are recorded with the HTTP status, API response, and request ID when available.

## Configure the key in PowerShell

Create an API key at <https://platform.openai.com/api-keys>. Set it only for the current PowerShell window:

```powershell
$env:OPENAI_API_KEY = "your-key-here"
```

Do not add the key to JavaScript, HTML, Git, screenshots, or chat messages.

## Validate without spending

```powershell
python scripts/test-image-cleanup.py --image "C:\path\to\photo.png" --dry-run
```

## Run one low-cost test

```powershell
python scripts/test-image-cleanup.py --image "C:\path\to\photo.png"
```

The request uses `gpt-image-2`, `quality=low`, `moderation=low`, and a 1024 x 1024 output by default. The raw result intentionally uses a solid green background. Transparency removal and resizing to 1254 x 1254 should be evaluated only after the API edit itself succeeds reliably.

Optional settings:

```powershell
python scripts/test-image-cleanup.py `
  --image "C:\path\to\photo.png" `
  --quality medium `
  --moderation auto `
  --output-dir "output\image-api-tests"
```

If an API version rejects `moderation=low`, rerun explicitly with `--moderation auto`. Do not add automatic retries: a manual rerun keeps spending deliberate and visible.
