# Stability AI background-removal test

This harness tests only deterministic subject segmentation. It does not reconstruct, rotate, redraw, or reinterpret the figure, and it is not connected to the web application yet.

## Cost and security

- One invocation sends at most one request.
- Stability currently documents the Remove Background service at 5 credits per successful request; failed requests are not charged.
- `--dry-run` sends nothing and costs nothing.
- The key is read from `STABILITY_API_KEY` and is never printed or stored.
- Results are written to the ignored `output/stability-background-tests/` directory.

## Create and configure a key

Create an account and API key at <https://platform.stability.ai/account/keys>. Keep the key private. In the PowerShell window used to run the test:

```powershell
$env:STABILITY_API_KEY = "your-key-here"
```

## Dry run

```powershell
python scripts/test-stability-background.py --image "C:\path\to\photo.png" --dry-run
```

## One test

```powershell
python scripts/test-stability-background.py --image "C:\path\to\photo.png"
```

The API result is a transparent PNG at the source resolution. If Pillow is installed, the script also creates a transparent 1254 x 1254 catalogue image with the visible subject centered, scaled to approximately 88% height, and positioned 85 pixels from the bottom.

If the console reports that Pillow is missing, install it for the active Python interpreter:

```powershell
python -m pip install --user pillow
```

Then rerun the one test. The API output remains usable even without Pillow.
