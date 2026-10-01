# API (Phase 1)

Contracts follow blueprint §16. Interactive docs are at `/docs` when `APP_ENV` is not `production`.

## Conventions

- **Auth:** every `/v1` endpoint requires `Authorization: Bearer <api key>`. Keys are created with the CLI; there is no HTTP endpoint for managing keys.
- **Content:** request and response bodies are JSON. Unknown request fields are rejected (`422`).
- **IDs:** prefixed ULIDs.
- **Request ID:** every response has an `X-Request-ID` header. A valid client-supplied value (8–64 chars `[A-Za-z0-9._-]`) is echoed back; otherwise one is generated.
- **Errors:** RFC 9457 `application/problem+json`:

```json
{
  "type": "urn:aromin:problem:provider_timeout",
  "title": "The model provider timed out",
  "status": 504,
  "code": "provider_timeout",
  "detail": "The model provider timed out",
  "instance": "/v1/chat",
  "request_id": "req_01J…",
  "task_id": "task_01J…"
}
```

Error bodies never contain stack traces, SQL, provider payloads or secrets. Validation errors list `{loc, msg, type}` per field and do not echo the submitted values.

| Code | Status | When |
|---|---|---|
| `validation_error` | 422 | Body, path or query invalid |
| `unauthorized` | 401 | Missing, malformed, unknown or revoked key (`WWW-Authenticate: Bearer`) |
| `forbidden` | 403 | Key's roles lack the permission |
| `not_found` | 404 | Unknown conversation, task or route |
| `conversation_busy` | 409 | Another turn is running for the conversation |
| `idempotency_conflict` | 409 | `client_msg_id` reused with different text |
| `previous_attempt_failed` | 409 | `client_msg_id` of a turn that failed; send a new id |
| `rate_limited` | 429 | Per-key chat limit (`Retry-After` header) |
| `provider_timeout` | 504 | Model call exceeded `LLM_TIMEOUT_SECONDS` |
| `provider_unavailable`, `provider_rate_limited`, `provider_not_configured` | 503 | Provider down, limiting, auth failure or not configured |
| `provider_bad_request`, `provider_invalid_response`, `provider_error` | 502 | Provider rejected the request or answered invalidly |
| `agent_error` | 500 | Turn could not complete (e.g. model requested a tool; tools are not enabled yet) |
| `internal_error` | 500 | Unexpected error (logged server-side with the request id) |

## Endpoints

### `GET /health`
Liveness, no auth: `{"status": "ok", "version": "0.1.0"}`.

### `GET /ready`
Readiness, no auth. `200 {"status":"ready","checks":{"database":"ok","redis":"ok|not_configured"}}` or `503` with `"not_ready"` and the failing check marked `"error"`.

### `POST /v1/conversations`
Permission `conversation:write`. Body (all optional):

```json
{"channel": "api", "customer_ref": "crm-42", "metadata": {"source": "landing"}}
```

`channel` is `api` or `web`; SMS conversations will be created by the SMS webhook. `metadata` holds at most 20 string pairs. The response is `201` with the conversation (`id`, `channel`, `status`, `agent_profile`, `created_at`, `last_message_at`, `metadata`). It records `conversation.created` and an audit entry.

### `GET /v1/conversations/{conversation_id}?limit=50&cursor=0`
Permission `conversation:read`. Returns the conversation plus messages with `seq > cursor`, oldest first, at most `limit` (1–200). `next_cursor` is the `seq` to pass for the next page, or `null`.

### `POST /v1/chat`
Permission `chat:write`, rate-limited per key. Body:

```json
{"conversation_id": "conv_01J…", "message": "سلام", "client_msg_id": "web-123", "channel": "api"}
```

| Field | Rules |
|---|---|
| `conversation_id` | Optional; omitted → a new conversation is created |
| `message` | Required, 1–4000 characters after trimming |
| `client_msg_id` | Optional, ≤ 64 chars `[A-Za-z0-9_-]`; makes retries safe |

Response `200`:

```json
{
  "conversation_id": "conv_01J…",
  "task_id": "task_01J…",
  "user_message_id": "msg_01J…",
  "message": {"id": "msg_01J…", "seq": 2, "role": "assistant", "content": "…", "created_at": "…"},
  "sources": [],
  "usage": {"input_tokens": 58, "output_tokens": 12},
  "replayed": false
}
```

Retrying with the same `client_msg_id` and the same text returns the stored reply with `"replayed": true` and never runs the model again. With the mock provider the reply text starts with `[mock] `.

Streaming: the runtime already produces events named after blueprint §16: `turn.started`, `message.delta`, `message.completed`, `error`. A `text/event-stream` variant of this endpoint is a later phase and needs no runtime change.

### `GET /v1/tasks/{task_id}`
Permission `task:read`. Returns `id`, `kind`, `status`, `mode`, `lane`, `conversation_id` and the timestamps (`created_at`, `started_at`, `finished_at`). `error` is `{code, error_class}` or `null`; internal details are not exposed. In Phase 1 every chat turn creates one `agent.run` task in `immediate` mode.
