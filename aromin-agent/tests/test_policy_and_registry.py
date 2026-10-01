"""Unit tests: policy engine decisions, tool spec/registry validation, safe calculator."""

import pytest
from pydantic import BaseModel, ConfigDict

from app.core.config import Settings
from app.policy.engine import ApprovalState, Decision, PolicyConfig, PolicyEngine, PolicyInput
from app.tools.builtin import BUILTIN_TOOL_NAMES, register_builtin_tools
from app.tools.calculator import evaluate
from app.tools.errors import ToolBusinessError, ToolValidationError
from app.tools.registry import ToolRegistry
from app.tools.spec import IdempotencyPolicy, RetryPolicy, RiskLevel, SideEffect, ToolSpec


class In(BaseModel):
    model_config = ConfigDict(extra="forbid")
    n: int = 0


class Out(BaseModel):
    ok: bool = True


async def _h(ctx, args):  # pragma: no cover
    return Out()


def spec(**kw) -> ToolSpec:
    base = dict(name="tt.tool", description="d", input_model=In, output_model=Out, handler=_h)
    return ToolSpec(**{**base, **kw})


def decide(engine: PolicyEngine, s: ToolSpec, perms=frozenset(), conversation="conv_1", approval=ApprovalState.none):
    return engine.decide(
        PolicyInput(
            actor_id="a", actor_type="api_key", roles=("service",), permissions=frozenset(perms), tool=s,
            conversation_id=conversation, customer_id=None, approval_state=approval,
        )
    )  # fmt: skip


# --- policy -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "risk,expected",
    [
        (RiskLevel.LOW, Decision.ALLOW),
        (RiskLevel.MEDIUM, Decision.ALLOW),
        (RiskLevel.HIGH, Decision.REQUIRE_APPROVAL),
        (RiskLevel.CRITICAL, Decision.DENY),
    ],
)
def test_risk_defaults(risk, expected):
    assert decide(PolicyEngine(PolicyConfig()), spec(risk_level=risk)).decision == expected


def test_critical_requires_explicit_enablement_and_then_approval():
    engine = PolicyEngine(PolicyConfig(allow_critical=True))
    s = spec(risk_level=RiskLevel.CRITICAL)
    assert decide(engine, s).decision == Decision.REQUIRE_APPROVAL
    assert decide(engine, s, approval=ApprovalState.approved).decision == Decision.ALLOW


@pytest.mark.parametrize(
    "state,decision,reason",
    [
        (ApprovalState.pending, Decision.REQUIRE_APPROVAL, "risk_high"),
        (ApprovalState.approved, Decision.ALLOW, "approved"),
        (ApprovalState.rejected, Decision.DENY, "approval_rejected"),
        (ApprovalState.expired, Decision.DENY, "approval_expired"),
        (ApprovalState.cancelled, Decision.DENY, "approval_cancelled"),
    ],
)
def test_approval_states(state, decision, reason):
    d = decide(PolicyEngine(PolicyConfig()), spec(risk_level=RiskLevel.HIGH), approval=state)
    assert (d.decision, d.reason) == (decision, reason)


def test_deny_rules_and_overrides():
    s = spec(permissions_required=frozenset({"x:read"}), requires_conversation=True)
    engine = PolicyEngine(PolicyConfig())
    assert decide(engine, s).reason == "missing_permission"
    assert decide(engine, s, perms={"x:read"}, conversation=None).reason == "missing_scope"
    assert decide(engine, s, perms={"x:read"}).decision == Decision.ALLOW
    assert decide(PolicyEngine(PolicyConfig(disabled_tools=frozenset({"tt.tool"}))), s, perms={"x:read"}).reason == (
        "tool_disabled"
    )
    deny = PolicyEngine(PolicyConfig(decision_overrides={"tt.tool": Decision.DENY}))
    assert decide(deny, s, perms={"x:read"}, approval=ApprovalState.approved).decision == Decision.DENY
    allow_high = PolicyEngine(PolicyConfig(decision_overrides={"tt.tool": Decision.ALLOW}))
    assert decide(allow_high, spec(risk_level=RiskLevel.HIGH)).decision == Decision.ALLOW
    # author's approval_required flag is a floor that configuration cannot remove
    flagged = spec(approval_required=True)
    assert decide(allow_high, flagged).decision == Decision.REQUIRE_APPROVAL


def test_policy_config_from_settings():
    s = Settings(
        _env_file=None, tool_risk_overrides={"a": "high"}, tool_policy_overrides={"b": "deny"},
        tools_disabled=["c"], allow_critical_tools=True,
    )  # fmt: skip
    cfg = PolicyConfig.from_settings(s)
    assert cfg.risk_overrides == {"a": RiskLevel.HIGH} and cfg.decision_overrides == {"b": Decision.DENY}
    assert cfg.disabled_tools == {"c"} and cfg.allow_critical
    with pytest.raises(ValueError):
        Settings(_env_file=None, tool_risk_overrides={"a": "EXTREME"})
    with pytest.raises(ValueError):
        Settings(_env_file=None, tool_policy_overrides={"a": "MAYBE"})


def test_risk_override_raises_but_never_lowers():
    engine = PolicyEngine(PolicyConfig(risk_overrides={"tt.tool": RiskLevel.HIGH}))
    assert decide(engine, spec(risk_level=RiskLevel.LOW)).decision == Decision.REQUIRE_APPROVAL
    lower = PolicyEngine(PolicyConfig(risk_overrides={"tt.tool": RiskLevel.LOW}))
    assert lower.effective_risk(spec(risk_level=RiskLevel.HIGH)) == RiskLevel.HIGH


# --- spec & registry ----------------------------------------------------------------------


def test_builtin_tools_have_full_metadata():
    r = ToolRegistry()
    register_builtin_tools(r)
    assert {s.name for s in r.allowed(BUILTIN_TOOL_NAMES)} == BUILTIN_TOOL_NAMES
    for s in r.allowed(BUILTIN_TOOL_NAMES):
        assert s.version and s.description and s.timeout_s > 0
        assert s.risk_level == RiskLevel.LOW and s.side_effect == SideEffect.none and not s.approval_required
        assert s.input_schema["additionalProperties"] is False and "properties" in s.output_schema
    names = [d.name for d in r.definitions(BUILTIN_TOOL_NAMES)]
    assert names == sorted(BUILTIN_TOOL_NAMES)


@pytest.mark.parametrize(
    "kw,match",
    [
        ({"name": "Bad Name"}, "invalid tool name"),
        ({"side_effect": SideEffect.internal_write}, "idempotency policy"),
        ({"side_effect": SideEffect.external_unsafe, "idempotency_policy": IdempotencyPolicy.key}, "effect ledger"),
        (
            {
                "side_effect": SideEffect.external_unsafe, "idempotency_policy": IdempotencyPolicy.ledger,
                "retry_policy": RetryPolicy(max_attempts=2),
            },
            "never retried",
        ),
    ],
)  # fmt: skip
def test_spec_validation(kw, match):
    with pytest.raises(ValueError, match=match):
        spec(**kw)


def test_registry_rejects_duplicates_and_unknown():
    r = ToolRegistry()
    r.register(spec())
    with pytest.raises(ValueError):
        r.register(spec())
    assert r.find("missing") is None


@pytest.mark.parametrize(
    "raw,code",
    [
        ({"n": "1"}, "schema_mismatch"),
        ({"n": 1, "x": 2}, "unknown_arguments"),
        ("{", "invalid_json"),
        ("[]", "not_an_object"),
    ],
)
def test_validate_arguments(raw, code):
    with pytest.raises(ToolValidationError) as info:
        ToolRegistry.validate_arguments(spec(), raw)
    assert info.value.code == code


def test_validate_arguments_accepts_json_string_and_defaults():
    assert ToolRegistry.validate_arguments(spec(), '{"n": 3}').n == 3
    assert ToolRegistry.validate_arguments(spec(), {}).n == 0


# --- calculator ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,value",
    [("1+2*3", 7), ("(3 * 1250000) * 0.9", 3375000.0), ("۲ × ۳", 6), ("10 // 3", 3), ("2 ** 10", 1024), ("-5 % 3", 1)],
)
def test_calculator_values(expr, value):
    assert evaluate(expr) == value


@pytest.mark.parametrize(
    "expr,code",
    [
        ("__import__('os').system('id')", "unsupported_expression"),
        ("x + 1", "unsupported_expression"),
        ("(1).real", "unsupported_expression"),
        ("[1][0]", "unsupported_expression"),
        ("2 ** 100000", "exponent_too_large"),
        ("1 / 0", "division_by_zero"),
        ("1 +", "invalid_expression"),
        ("9" * 300, "expression_too_long"),
        ("10 ** 20", "result_too_large"),
        ("'a' * 3", "unsupported_expression"),
    ],
)
def test_calculator_rejects_unsafe_or_invalid(expr, code):
    with pytest.raises(ToolBusinessError) as info:
        evaluate(expr)
    assert info.value.code == code
