"""Policy Engine (blueprint §14 business policy layer).

A pure, server-side function: ``decide(PolicyInput) -> PolicyDecision``. It never reads model
output or tool output as authority; the approval state it sees comes from the approvals table.
Authorization (RBAC permissions) is checked by the executor *before* policy, and policy
re-checks it as defense in depth.

Decision order (first match wins, then the strictest result is kept):
1. tool disabled by configuration                          -> DENY  (tool_disabled)
2. actor lacks a required permission                       -> DENY  (missing_permission)
3. tool needs a conversation scope and has none            -> DENY  (missing_scope)
4. CRITICAL risk while ALLOW_CRITICAL_TOOLS is false       -> DENY  (critical_disabled)
5. base decision = per-tool override, else risk default:
   LOW -> ALLOW, MEDIUM -> ALLOW, HIGH -> REQUIRE_APPROVAL, CRITICAL -> REQUIRE_APPROVAL
6. tool flagged ``approval_required``                      -> at least REQUIRE_APPROVAL
7. REQUIRE_APPROVAL with approval state approved           -> ALLOW (approved)
   rejected / expired / cancelled                           -> DENY  (approval_<state>)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from app.core.config import Settings
from app.tools.spec import RiskLevel, SideEffect, ToolSpec


class Decision(StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


_STRICTNESS = {Decision.ALLOW: 0, Decision.REQUIRE_APPROVAL: 1, Decision.DENY: 2}

DEFAULT_RISK_DECISIONS: dict[RiskLevel, Decision] = {
    RiskLevel.LOW: Decision.ALLOW,
    RiskLevel.MEDIUM: Decision.ALLOW,
    RiskLevel.HIGH: Decision.REQUIRE_APPROVAL,
    RiskLevel.CRITICAL: Decision.REQUIRE_APPROVAL,
}


class ApprovalState(StrEnum):
    none = "none"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    expired = "expired"
    cancelled = "cancelled"


@dataclass(frozen=True)
class PolicyConfig:
    environment: str = "development"
    risk_overrides: dict[str, RiskLevel] = field(default_factory=dict)
    decision_overrides: dict[str, Decision] = field(default_factory=dict)
    disabled_tools: frozenset[str] = frozenset()
    allow_critical: bool = False
    risk_decisions: dict[RiskLevel, Decision] = field(default_factory=lambda: dict(DEFAULT_RISK_DECISIONS))

    @classmethod
    def from_settings(cls, settings: Settings) -> PolicyConfig:
        return cls(
            environment=settings.app_env.value,
            risk_overrides={k: RiskLevel(v) for k, v in settings.tool_risk_overrides.items()},
            decision_overrides={k: Decision(v) for k, v in settings.tool_policy_overrides.items()},
            disabled_tools=frozenset(settings.tools_disabled),
            allow_critical=settings.allow_critical_tools,
        )


@dataclass(frozen=True)
class PolicyInput:
    actor_id: str
    actor_type: str
    roles: tuple[str, ...]
    permissions: frozenset[str]
    tool: ToolSpec
    conversation_id: str | None
    customer_id: str | None
    approval_state: ApprovalState = ApprovalState.none


@dataclass(frozen=True)
class PolicyDecision:
    decision: Decision
    reason: str
    risk_level: RiskLevel
    action_type: str

    @property
    def allowed(self) -> bool:
        return self.decision == Decision.ALLOW


def action_type(spec: ToolSpec) -> str:
    return {
        SideEffect.none: "read",
        SideEffect.internal_write: "write",
        SideEffect.external_idempotent: "external",
        SideEffect.external_unsafe: "external",
    }[spec.side_effect]


class PolicyEngine:
    def __init__(self, config: PolicyConfig) -> None:
        self.config = config

    def effective_risk(self, spec: ToolSpec) -> RiskLevel:
        override = self.config.risk_overrides.get(spec.name)
        if override is None:
            return spec.risk_level
        # configuration may raise a tool's risk but never lower it below the author's level
        order = list(RiskLevel)
        return max(override, spec.risk_level, key=order.index)

    def decide(self, inp: PolicyInput) -> PolicyDecision:
        spec = inp.tool
        risk = self.effective_risk(spec)
        act = action_type(spec)

        def out(decision: Decision, reason: str) -> PolicyDecision:
            return PolicyDecision(decision, reason, risk, act)

        if spec.name in self.config.disabled_tools:
            return out(Decision.DENY, "tool_disabled")
        if not spec.permissions_required <= inp.permissions:
            return out(Decision.DENY, "missing_permission")
        if spec.requires_conversation and not inp.conversation_id:
            return out(Decision.DENY, "missing_scope")
        if risk == RiskLevel.CRITICAL and not self.config.allow_critical:
            return out(Decision.DENY, "critical_disabled")

        base = self.config.decision_overrides.get(spec.name, self.config.risk_decisions[risk])
        reason = "override" if spec.name in self.config.decision_overrides else f"risk_{risk.value.lower()}"
        if spec.approval_required and _STRICTNESS[base] < _STRICTNESS[Decision.REQUIRE_APPROVAL]:
            base, reason = Decision.REQUIRE_APPROVAL, "approval_required"
        if base == Decision.REQUIRE_APPROVAL:
            if inp.approval_state == ApprovalState.approved:
                return out(Decision.ALLOW, "approved")
            if inp.approval_state in (ApprovalState.rejected, ApprovalState.expired, ApprovalState.cancelled):
                return out(Decision.DENY, f"approval_{inp.approval_state.value}")
        return out(base, reason)
