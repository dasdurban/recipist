# Recipe fetch proxy (AWS Lambda)

The app's webview can't fetch recipe sites directly — browsers block cross-origin
requests. The app therefore routes imports through a proxy, configured in
**Settings → General → CORS proxy**. The default public proxies
(`api.allorigins.win`, `api.codetabs.com`, …) are rate-limited and flaky; this
folder deploys your own replacement: one Lambda function behind a public
Function URL, zero dependencies, ~pennies per month.

One endpoint serves **both** things the app needs:

| App call | Path | What it expects back |
| --- | --- | --- |
| Recipe page import | `src/lib/importRecipe.ts` | HTML with the original `content-type` |
| Recipe photo inlining | `src/lib/ocr.ts` | real image bytes with an `image/*` `content-type` |

The app appends the encoded target to whatever template you configure, so the
setting you paste must end in `url=`:

```
https://<url-id>.lambda-url.<region>.on.aws/?url=
```

## Deploy

### Option A — script (recommended)

Needs the AWS CLI v2 with working credentials and `zip`.

First, sign in — pick whichever suits you:

```bash
# 1) Browser sign-in (easiest; temporary credentials, auto-refreshed)
aws login

# 2) Access keys written to ~/.aws/credentials (prompts for key, secret, region)
aws configure

# 3) Per-shell environment variables (nothing written to disk)
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1
```

For access keys: AWS Console → IAM → Users → your user → **Security credentials** →
**Create access key** → *Command Line Interface (CLI)*.

The identity you use needs permission to create a Lambda function, its execution
role, and a Function URL (`lambda:*`, `iam:CreateRole`, `iam:AttachRolePolicy`,
`iam:PassRole`). AdministratorAccess covers it; otherwise attach a scoped policy.

Then:

```bash
cd lambda/recipe-proxy
chmod +x deploy.sh
./deploy.sh
```

It creates the execution role if needed, zips and deploys `index.mjs`, creates the
public Function URL, runs a smoke test, and prints the exact string to paste into
Settings. Useful overrides:

```bash
REGION=eu-west-1 ./deploy.sh
PROXY_TOKEN=some-long-secret ./deploy.sh                 # require ?token=…
ALLOWED_HOSTS="seriouseats.com,bbcgoodfood.com" ./deploy.sh
DESTROY=1 ./deploy.sh                                    # delete the function
```

Re-running `./deploy.sh` updates the existing function in place.

### Option B — console, no CLI

1. Lambda → **Create function** → Author from scratch → name `recipe-fetch-proxy`,
   runtime **Node.js 20.x**.
2. Paste the contents of `index.mjs` into the code editor. Handler stays `index.handler`.
3. Configuration → General: **timeout 20 s**, memory 256 MB.
4. Configuration → Function URL → **Create function URL**, auth type **NONE**.
   Leave its CORS checkbox **off** — the handler already returns CORS headers, and
   configuring both makes the browser reject responses with duplicate
   `access-control-allow-origin` values.
5. Copy the Function URL and append `?url=`.

## Switch the app over

Paste the printed value into **Settings → General → CORS proxy**. No rebuild is
required — the setting is read at import time. Existing installs keep their stored
value, so set it on every machine you use.

Optional: make it the default for fresh installs by changing the
`importProxy` value in `src/db/database.ts`.

## Verify

```bash
# Should print "200" and the page HTML
curl -s "https://<url-id>.lambda-url.<region>.on.aws/?url=https%3A%2F%2Fexample.com%2F" | head -c 200

# Image path (should return image/* bytes)
curl -sD - -o /dev/null \
  "https://<url-id>.lambda-url.<region>.on.aws/?url=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("https://www.example.com/photo.jpg",safe=""))')"
```

Then in the app: Import → paste a recipe link → Fetch. A page that previously
failed on the public proxies should now load.

## Configuration

Set as Lambda environment variables (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PROXY_TOKEN` | unset | Shared secret. When set, requests without `?token=` get 401. |
| `ALLOWED_HOSTS` | unset | Comma-separated allowlist of domains; subdomains included. |
| `MAX_BYTES` | `4194304` (4 MiB) | Max upstream body. Lambda caps responses at 6 MiB. |
| `FETCH_TIMEOUT_MS` | `15000` | Upstream fetch timeout. Keep below the app's 25 s abort. |

With `PROXY_TOKEN` set, the setting you paste is:

```
https://<url-id>.lambda-url.<region>.on.aws/?token=YOUR_TOKEN&url=
```

## Troubleshooting

**403 Forbidden from the Function URL.** Since October 2025 a function URL needs
*two* resource-based policy statements — `lambda:InvokeFunctionUrl` **and**
`lambda:InvokeFunction` — even with auth type `NONE`. `deploy.sh` adds both; if you
created the URL by hand, add the second one:

```bash
aws lambda add-permission --function-name recipe-fetch-proxy \
  --statement-id FunctionURLInvokeFunction --action lambda:InvokeFunction \
  --principal "*" --invoked-via-function-url
```

Check what's granted: `aws lambda get-policy --function-name recipe-fetch-proxy`.

**Other checks**

```bash
# Does the function itself work? (bypasses the URL policy)
aws lambda invoke --function-name recipe-fetch-proxy --cli-binary-format raw-in-base64-out \
  --payload '{"queryStringParameters":{"url":"https://example.com/"}}' /dev/stdout

aws logs tail /aws/lambda/recipe-fetch-proxy --follow   # request logs
```

## Notes

- **Cold starts** add a few hundred ms; the app also tries its built-in fallback
  proxies, then a direct fetch (which works in some packaged builds).
- **Cost** falls inside the always-free tier for personal use (1M requests +
  400,000 GB-s per month).
- **Security**: the URL (and token) live in the app's settings, so anyone with the
  app can call the proxy. Treat the token as rate-limit friction, not real auth.
  `ALLOWED_HOSTS` is the stronger control. The handler blocks loopback, private,
  link-local, and CGNAT addresses so it can't be pointed at your own network.
- **Caching**: responses send `cache-control: public, max-age=300`. Put CloudFront
  in front of the Function URL if you want shared caching and lower latency.
- **Logs**: `aws logs tail /aws/lambda/recipe-fetch-proxy --follow`
