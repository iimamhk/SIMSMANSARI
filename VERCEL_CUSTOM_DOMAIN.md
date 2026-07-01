## Vercel Custom Domain Checklist

Use this after the first Vercel deployment succeeds.

### In Vercel

1. Open the deployed project.
2. Go to Settings > Domains.
3. Add your domain, for example `simsmansari.sch.id` or `app.simsmansari.id`.
4. Copy the DNS records suggested by Vercel.

### DNS patterns

For a subdomain such as `app.example.com`:

- Add a CNAME record pointing to `cname.vercel-dns.com`.

For an apex domain such as `example.com`:

- Add the A record required by Vercel.
- If your DNS provider supports ALIAS or ANAME for apex domains, that is also acceptable when Vercel indicates it.

### Recommended domain layout

- Use `www` or `app` for the application.
- Redirect the bare domain to the main application hostname.

Example:

- `www.simsmansari.id` -> primary Vercel app domain
- `simsmansari.id` -> redirect to `www.simsmansari.id`

### After DNS is added

1. Wait for Vercel domain verification.
2. Mark the intended hostname as Primary.
3. Test login, dashboard navigation, Firestore connectivity, and mobile layout from the custom domain.

### Important note for this project

The app uses hash routing such as `#admin/dashboard`, so custom domain setup does not need SPA rewrite rules.
