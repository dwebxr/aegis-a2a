# Security Notes

## Known Dependency Advisories

`next@14.2.35` has 6 advisories (3 moderate, 3 high). All are DoS-related:

| Advisory | Applies? | Reason |
|----------|----------|--------|
| HTTP request deserialization DoS | Mitigated | Rate limiting added on all POST endpoints |
| DoS via excessive CPU from middleware | No | No middleware used |
| HTTP request smuggling in rewrites | No | No rewrites configured |
| Unbounded next/image disk cache | No | next/image not used |

Full remediation requires upgrading to Next.js 15.x (React 19). Track in: https://nextjs.org/blog

## Configuration

All secrets are externalized via environment variables. See `.env.local.example`.
No secrets, private keys, or API keys are hardcoded in source code.

Private keys never leave the user's browser - all wallet signing happens client-side
via MetaMask (EVM), Phantom (Solana), or Plug (ICP) browser extensions.

## Aegis Bridge

The bridge connects to Aegis本体 (`AEGIS_HONTAL_URL`) via public D2A APIs.

- **No shared secrets** — bridge uses Aegis's public endpoints, no HMAC or API keys
- **Disabled by default** — `AEGIS_BRIDGE_ENABLED=false`; opt-in only
- **Rate limited** — `/api/bridge/sync` (POST) and `/api/bridge/status` (GET) are rate-limited
- **Outbound only** — A2A fetches from Aegis; Aegis does not call A2A
- **Timeouts** — All external fetches have 10-30s AbortSignal timeouts
- **No credentials stored** — If x402 paywall is active, bridge falls back to free-tier preview
