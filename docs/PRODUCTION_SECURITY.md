# MarketBook SL production security

## Current API protections

- Helmet applies standard HTTP security headers and Express does not advertise its
  framework signature.
- JSON bodies default to a 100 KB maximum.
- Registration, login, and refresh requests are rate limited.
- Malformed and oversized JSON receives a safe response without echoing submitted
  values.
- Unexpected production errors omit stack traces and request data.
- Every response includes an `X-Request-Id` for tracing, while request logs exclude
  headers, query strings, and bodies.

## Environment settings

`JSON_BODY_LIMIT` controls the maximum request body accepted by the API. Keep it
small unless a reviewed endpoint genuinely needs larger payloads.

`AUTH_RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX` control authentication
attempts per client IP. The defaults allow 10 requests in 15 minutes.

`TRUST_PROXY_HOPS` must stay `0` when the API is directly exposed. When a reviewed
hosting platform places a fixed number of trusted reverse proxies in front of the
API, set it to that exact number. An incorrect value can make IP-based controls
unreliable.

The current rate-limit store is process-local. Before running more than one API
instance, configure a shared supported store such as Redis so limits apply across
all instances. Do not launch a multi-instance production deployment with separate
in-memory counters.

## Production launch checks

1. Use long, unique JWT access and refresh secrets from a secrets manager.
2. Restrict `CORS_ORIGIN` to the approved application origin.
3. Require TLS at the hosting/load-balancer layer.
4. Set the exact trusted-proxy count supplied by the hosting provider.
5. Confirm authentication throttling from the public endpoint.
6. Keep database and payment-provider credentials out of logs and source control.
7. Run dependency, application-security, and infrastructure reviews before launch.
8. Monitor repeated authentication failures and HTTP 429 responses without
   recording passwords or tokens.

## Health and deployment probes

`GET /health` confirms that the API process is running. `GET /ready` additionally
checks PostgreSQL and returns HTTP 503 when the API should not receive traffic.
Configure the hosting platform's liveness probe to use `/health` and its readiness
probe to use `/ready`.

The server handles `SIGINT` and `SIGTERM` by stopping new connections, allowing
active requests to finish, disconnecting Prisma, and then exiting. The hosting
platform should provide at least 10 seconds of termination grace time.
