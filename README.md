# Custom Minifigs Collector

A responsive collectors guide for custom LEGO minifigs. The catalogue reads its data from a public Google Sheet and keeps owned and wishlist changes locally in the browser.

## Run locally

Open `index.html` in a browser. The Google Sheet must remain shared as **Anyone with the link can view**.

## Data fields

The connected sheet supports minifig name, character, brand, estimated value, origin, collection state, condition/status, and a Google Drive photo URL.

## Notes

Owned and wishlist changes are saved in the browser's local storage; they do not write back to the Google Sheet.

## Hosting

The current production deployment can remain on Vercel. A provider-neutral static build is available for a future Cloudflare Pages migration:

```text
node scripts/build-static.mjs
```

Use `dist` as the hosting output directory. See [CLOUDFLARE_MIGRATION.md](CLOUDFLARE_MIGRATION.md) for the staged migration, authentication, DNS, and rollback checklist.
