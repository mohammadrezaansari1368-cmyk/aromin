"""Exact permitted replay payloads are separate from sanitized audit previews.

These helpers do not grant authorization. Replayed tools still require the full
ToolExecutor security pipeline and current server-bound requester scope.
"""

import hashlib
import json
from typing import Any

from app.core.logging import redact_mapping
from app.models.tooling import TaskStep
from app.tools.spec import ToolSpec


class ReplayUnavailable(ValueError):
    """Fail closed: no exact supported replay data is available."""


def journal_key(task_id: str, generation: int, step_no: int) -> str:
    if not task_id or generation < 0 or step_no < 1:
        raise ValueError("invalid journal position")
    encoded = json.dumps([task_id, generation, step_no], ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:32]


def exact_json(payload: dict[str, Any], *, max_bytes: int = 65536) -> dict[str, Any]:
    """Copy JSON exactly or reject; never truncate or stringify arbitrary objects."""
    if not isinstance(payload, dict):
        raise ReplayUnavailable("replay input must be an object")

    def validate(value):
        if isinstance(value, dict):
            if any(not isinstance(key, str) for key in value):
                raise ReplayUnavailable("JSON object keys must be strings")
            for item in value.values():
                validate(item)
        elif isinstance(value, list):
            for item in value:
                validate(item)
        elif value is not None and type(value) not in (str, int, float, bool):
            raise ReplayUnavailable("unsupported JSON value")

    try:
        validate(payload)
        encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > max_bytes:
            raise ReplayUnavailable("replay payload exceeds storage limit")
        return json.loads(encoded)
    except (TypeError, ValueError, RecursionError) as exc:
        raise ReplayUnavailable("unsupported replay payload") from exc


def tool_replay_input(spec: ToolSpec, args: dict[str, Any]) -> dict[str, Any]:
    # Encryption/scoped reference recovery is deferred; reject sensitive schemas.
    if spec.sensitive_fields or redact_mapping(args) != args:
        raise ReplayUnavailable("sensitive tool input requires protected reference recovery")
    if set(args) - set(spec.input_model.model_fields):
        raise ReplayUnavailable("unknown tool arguments")
    validated = spec.input_model.model_validate(args, strict=True)
    return exact_json(validated.model_dump(mode="json"))


def replay_input(step: TaskStep) -> dict[str, Any]:
    if not step.idempotency_key or step.replay_input is None:
        raise ReplayUnavailable("legacy or unsupported step requires operator review")
    return exact_json(step.replay_input)
