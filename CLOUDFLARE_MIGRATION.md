# Cloudflare Pages migration

The live site can remain on Vercel while the Cloudflare Pages deployment is prepared and tested on its temporary `pages.dev` address. Changing nameservers is the final cutover step, not the first one.

## 1. Create the Pages project

1. In Cloudflare, open **Workers & Pages** and create a Pages project from Git.
2. Connect the GitHub repository `mreizinho/custom-minifigs-collector`.
3. Use `main` as the production branch.
4. Select **None** as the framework preset.
5. Set the build command to `node scripts/build-static.mjs`.
6. Set the build output directory to `dist`.
7. No environment variables are required.

The build deliberately excludes development PDFs, test output, temporary images, Firebase deployment files, and repository-only documentation.

## 2. Test the temporary Cloudflare address

Before moving `cmcollector.com`, verify the generated `https://<project>.pages.dev` address:

- the catalogue and bundled demo photos load;
- `/admin/` opens;
- light/dark mode and mobile layout work;
- Google sign-in works;
- the owner account has premium access;
- a non-premium account sees the demo restrictions;
- Firestore settings sync works for an active premium account.

## 3. Authorize the Cloudflare origins

Before testing authentication, add the temporary Pages hostname and final domains where applicable:

- Firebase Authentication **Authorized domains**: `<project>.pages.dev`, `cmcollector.com`, and `www.cmcollector.com`.
- Google Cloud OAuth client **Authorized JavaScript origins**: `https://<project>.pages.dev`, `https://cmcollector.com`, and `https://www.cmcollector.com`.
- Google API key website/referrer restrictions: add `https://<project>.pages.dev/*`, `https://cmcollector.com/*`, and `https://www.cmcollector.com/*`.

Keep the Vercel origins authorized until migration and rollback testing are complete.

## 4. Attach the custom domain

1. Add `cmcollector.com` and `www.cmcollector.com` to the Cloudflare Pages project.
2. Copy every current DNS record from Vercel, especially MX, SPF, DKIM, DMARC, verification, and other email records.
3. In the Vercel domain settings, replace the Vercel nameservers with the two nameservers assigned by Cloudflare.
4. Wait for Cloudflare to confirm the domain and issue certificates.
5. Test both the apex and `www` addresses before removing the domain from the Vercel project.

DNS propagation can be gradual. Do not delete the Vercel project during migration.

## 5. Rollback

If the cutover fails, restore Vercel's nameservers in the Vercel domain settings. Keep the Vercel deployment, DNS record list, and Firebase/Vercel authorized origins intact until Cloudflare has been stable for several days.

## Local build verification

Run:

```text
node scripts/build-static.mjs
```

Serve the generated `dist` directory with any static HTTP server and test `/` and `/admin/`.
