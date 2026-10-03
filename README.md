# AnySkin Converter

Next.js App Router, React, strict TypeScript and Tailwind CSS. Converts a Java Edition skin into a signed Minecraft texture through a server-side MineSkin V2 integration.

## Setup

Requires Node.js 22.9+ (Node 24 recommended).

```sh
npm install
```

Create `.env.local` using `.env.example`:

```dotenv
MINESKIN_API_KEY=your_key_here
```

```sh
npm run dev
```

Open http://localhost:3000. Upload one 64×64 PNG (maximum 1 MB), select Slim / Alex (3-pixel arms, default) or Classic / Steve (4-pixel arms), then generate. The selected model is always sent explicitly. The canvas front view is a preview only; it never changes uploaded pixels.

## Generation

`POST /api/skin` validates a size-bounded multipart upload, PNG signature, dimensions, structure and CRCs, then fully decodes it with pngjs. Legacy 64×32 and animated PNGs are not supported. A structurally valid 64×64 PNG cannot prove Minecraft artwork semantics; MineSkin performs its own acceptance checks.

The backend submits `file`, `variant` and `visibility=unlisted` to `POST https://api.mineskin.org/v2/queue`. It handles immediate HTTP 200 skins and HTTP 202 jobs, polls `/v2/queue/:jobId` no faster than once per second, and stops after 85 seconds or 70 polls. The API schema was checked against the [official OpenAPI specification](https://github.com/MineSkin/docs/blob/main/spec/openapi.json), [queue documentation](https://docs.mineskin.org/docs/mineskin-api/queue-skin-generation/) and [job status documentation](https://docs.mineskin.org/docs/mineskin-api/get-job-status/).

The route streams newline-delimited JSON with actual `status`, `result`, or `error` events. Pre-stream errors use JSON and HTTP error status codes. Errors after streaming begins use the same error object inside an `error` event. HTTP 429 ends the operation and passes a sanitized retry delay to the client, using Retry-After and MineSkin `rateLimit.next` data. A shared process-local cooldown prevents immediate repeat requests.

Results include the exact returned texture URL, model, hash, UUID (when provided), value and signature. No URL, signature or texture data is fabricated. `/skin <texture URL>` is the requested AnySkin output. Returned HTTP texture URLs, if any, are preserved rather than silently rewritten.

## Security

`MINESKIN_API_KEY` is read only by the server route; never prefix it with `NEXT_PUBLIC_`. Uploads stay in memory and are not stored by this application. They are sent to MineSkin, where generated textures can persist even when unlisted. The backend limits complete request bodies even without Content-Length, rejects cross-site browser requests, aborts generation on disconnect and limits concurrent requests to three per process. It returns no raw provider error bodies, headers or stack traces.

For a public deployment, configure ingress upload limits and rate limiting appropriate to your traffic. Process-local limits are not shared across replicas. Preserve the public Host header through your reverse proxy so it matches the browser's Origin host.

## Verification

```sh
npm run test
npm run lint
npm run build
npm start
```

Tests use isolated upstream fixtures for 200/202 flows, model preservation, corrupt PNGs, bounded uploads, failed jobs, rate limits and safe errors. Fixtures are never used by the application. A real MineSkin key is needed to verify live generation; no live success is claimed without it.

## Production deployment

Deploy as a Node.js service; static export is not supported. Supply `MINESKIN_API_KEY` at runtime. Allow at least 100 seconds for requests and disable proxy response buffering for `/api/skin`. HTTPS enables clipboard access outside localhost.

Optional Docker:

```sh
docker build -t anyskin-converter .
docker run --rm -p 3000:3000 --env-file .env.local anyskin-converter
```

Docker is not required for development. The image uses Next.js standalone output and runs as the unprivileged Node user.
