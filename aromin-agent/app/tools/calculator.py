"""Safe arithmetic evaluator for the ``calculate`` tool.

Parses with ``ast`` and evaluates only numeric literals, + - * / // % **, unary +/- and
parentheses. No names, attributes, calls or subscripts are accepted, so nothing can execute
arbitrary Python. Size limits keep evaluation cheap.
"""

from __future__ import annotations

import ast
import math
import operator

from app.tools.errors import ToolBusinessError

MAX_EXPRESSION_CHARS = 200
MAX_EXPONENT = 64
MAX_ABS_VALUE = 1e15

_BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def evaluate(expression: str) -> float | int:
    if len(expression) > MAX_EXPRESSION_CHARS:
        raise ToolBusinessError("expression too long", code="expression_too_long")
    normalized = expression.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩×÷", "01234567890123456789*/"))
    try:
        tree = ast.parse(normalized, mode="eval")
    except SyntaxError as exc:
        raise ToolBusinessError("invalid expression", code="invalid_expression") from exc
    value = _eval(tree.body)
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        raise ToolBusinessError("result is not a finite number", code="not_finite")
    return value


def _eval(node: ast.AST) -> float | int:
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        return node.value
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _check(_UNARY[type(node.op)](_eval(node.operand)))
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > MAX_EXPONENT:
            raise ToolBusinessError("exponent too large", code="exponent_too_large")
        try:
            return _check(_BINARY[type(node.op)](left, right))
        except ZeroDivisionError as exc:
            raise ToolBusinessError("division by zero", code="division_by_zero") from exc
        except OverflowError as exc:
            raise ToolBusinessError("result too large", code="result_too_large") from exc
    raise ToolBusinessError("only numbers and + - * / // % ** ( ) are allowed", code="unsupported_expression")


def _check(value: float | int) -> float | int:
    if isinstance(value, complex) or abs(value) > MAX_ABS_VALUE:
        raise ToolBusinessError("result out of range", code="result_too_large")
    return value
