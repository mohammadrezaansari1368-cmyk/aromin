import pytest

from app.context.engine import ContextBudget, ContextEngine, ContextTurn, estimate_tokens


def build(engine: ContextEngine, history):
    return engine.build(system_prompt="sys", history=history, model="m", max_output_tokens=100, timeout_s=5)


def test_keeps_order_and_skips_non_conversation_roles():
    req = build(ContextEngine(), [ContextTurn("user", "a"), ContextTurn("system", "x"), ContextTurn("assistant", "b")])
    assert [(m.role, m.content) for m in req.messages] == [("system", "sys"), ("user", "a"), ("assistant", "b")]


def test_drops_oldest_turns_beyond_budget_but_keeps_latest():
    engine = ContextEngine(ContextBudget(history_tokens=estimate_tokens("x" * 30) * 2))
    history = [ContextTurn("user", f"{i}" * 30) for i in range(5)]
    req = build(engine, history)
    assert [m.content[0] for m in req.messages[1:]] == ["3", "4"]
    huge = build(ContextEngine(ContextBudget(history_tokens=1)), [ContextTurn("user", "y" * 500)])
    assert huge.messages[-1].content == "y" * 500  # newest user message is never dropped


def test_system_prompt_budget_enforced():
    with pytest.raises(ValueError):
        ContextEngine(ContextBudget(system_tokens=5)).build(
            system_prompt="z" * 100, history=[], model="m", max_output_tokens=1, timeout_s=1
        )
