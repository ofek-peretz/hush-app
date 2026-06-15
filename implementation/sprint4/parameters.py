"""
Parameter override context manager (Phase 0 calibration support). Sprint 4.

THE critical Sprint 4 primitive (readiness review HD1). The production path binds every
calibration-target constant at IMPORT/DEF time, and the callers invoke the math WITHOUT
passing the parameter, so setting `constants.X` at runtime changes NOTHING the production
path reads. To sweep a parameter while driving the real `SessionEngine` (Q4), this module
patches the EXACT binding site and restores it in `finally`, asserting restoration.

It is HARNESS-ONLY. It must NEVER wrap the golden test suite, and it adopts no value —
Sprint 4 is recommend-only (Q1). `STABILITY_N`, the volume bands, the templates, and
`CAPABILITY_PRIORITY_ORDER` are ratified and are NOT patchable targets.

Binding-site map (verified in code, readiness review HD1):
  KAPPA / RIR_REFERENCE / EXERCISE_COST_DEFAULT -> fatigue.set_fatigue default args
  SIGMA2_REF                                    -> variance.agreement default arg
  DECISION_CONF_GATE                            -> decision.govern default arg
  SURPRISE_DEADBAND                             -> decision.update_streaks default arg
  PREFERENCE_NUDGE                              -> preference.nudge default arg
  SESSION_FATIGUE_CEILING                       -> composition.compose_session KW-only default
  P_EXPLORE                                     -> composition.P_EXPLORE module global
  TAU_SYS / TAU_CAP                             -> pipeline.TAU_SYS / pipeline.TAU_CAP globals

Each site is resolved BY NAME via inspect.signature (never by a hardcoded __defaults__
index — the tuple order is fragile). Patching a function object's defaults propagates to
every module that imported that same function object (govern, agreement, nudge,
compose_session are all the same objects the callers use).

CONCEPTUAL LOCATION: sim/parameters.py (harness package; imports the frozen model).
"""
from __future__ import annotations
import contextlib
import inspect

from hush_model import fatigue, variance, decision, preference, composition
from hush_model.persistence import pipeline


# key -> (target_object, attr_or_param_name, kind)
#   kind "default" : a function default argument (positional-or-keyword or keyword-only)
#   kind "global"  : a module-level attribute referenced at call time
_REGISTRY: dict[str, tuple[object, str, str]] = {
    "KAPPA":                  (fatigue.set_fatigue, "kappa", "default"),
    "RIR_REFERENCE":          (fatigue.set_fatigue, "rir_reference", "default"),
    "EXERCISE_COST_DEFAULT":  (fatigue.set_fatigue, "exercise_cost", "default"),
    "SIGMA2_REF":             (variance.agreement, "sigma2_ref", "default"),
    "DECISION_CONF_GATE":     (decision.govern, "conf_gate", "default"),
    "SURPRISE_DEADBAND":      (decision.update_streaks, "deadband", "default"),
    "PREFERENCE_NUDGE":       (preference.nudge, "step", "default"),
    "SESSION_FATIGUE_CEILING": (composition.compose_session, "ceiling", "default"),
    "P_EXPLORE":              (composition, "P_EXPLORE", "global"),
    "TAU_SYS":                (pipeline, "TAU_SYS", "global"),
    "TAU_CAP":                (pipeline, "TAU_CAP", "global"),
}

# The model's source-of-truth values (constants.py), used by the recommend-only guard
# (Q1): the calibration run must leave these — and the live bindings — exactly equal.
from hush_model import constants as _C
_SOURCE_VALUE = {
    "KAPPA": _C.KAPPA, "RIR_REFERENCE": _C.RIR_REFERENCE,
    "EXERCISE_COST_DEFAULT": _C.EXERCISE_COST_DEFAULT, "SIGMA2_REF": _C.SIGMA2_REF,
    "DECISION_CONF_GATE": _C.DECISION_CONF_GATE, "SURPRISE_DEADBAND": _C.SURPRISE_DEADBAND,
    "PREFERENCE_NUDGE": _C.PREFERENCE_NUDGE, "SESSION_FATIGUE_CEILING": _C.SESSION_FATIGUE_CEILING,
    "P_EXPLORE": _C.P_EXPLORE, "TAU_SYS": _C.TAU_SYS, "TAU_CAP": dict(_C.TAU_CAP),
}

PARAMETERS = tuple(_REGISTRY.keys())


def current_value(key: str):
    """Read the value the PRODUCTION PATH currently uses for `key` (at its binding site)."""
    target, name, kind = _REGISTRY[key]
    if kind == "global":
        return getattr(target, name)
    return _read_default(target, name)


# ----------------------------- default-arg patching (by name) -----------------------------

def _read_default(func, name: str):
    p = inspect.signature(func).parameters[name]
    if p.kind == inspect.Parameter.KEYWORD_ONLY:
        return func.__kwdefaults__[name]
    return func.__defaults__[_pos_index(func, name)]


def _pos_index(func, name: str) -> int:
    defaulted = [
        q.name for q in inspect.signature(func).parameters.values()
        if q.default is not inspect.Parameter.empty
        and q.kind in (q.POSITIONAL_OR_KEYWORD, q.POSITIONAL_ONLY)
    ]
    return defaulted.index(name)


def _patch_default(func, name: str, value):
    p = inspect.signature(func).parameters[name]
    if p.kind == inspect.Parameter.KEYWORD_ONLY:
        old = func.__kwdefaults__[name]
        func.__kwdefaults__[name] = value
        return old
    idx = _pos_index(func, name)
    cur = list(func.__defaults__)
    old = cur[idx]
    cur[idx] = value
    func.__defaults__ = tuple(cur)
    return old


def _restore_default(func, name: str, old):
    p = inspect.signature(func).parameters[name]
    if p.kind == inspect.Parameter.KEYWORD_ONLY:
        func.__kwdefaults__[name] = old
        return
    idx = _pos_index(func, name)
    cur = list(func.__defaults__)
    cur[idx] = old
    func.__defaults__ = tuple(cur)


# ----------------------------- the context manager -----------------------------

@contextlib.contextmanager
def override_parameters(**overrides):
    """Temporarily set production-path parameter bindings, restoring on exit.

    Usage (harness only):  with override_parameters(KAPPA=0.07, TAU_SYS=1.2): run_sweep(...)
    Restores every patched site in `finally` and asserts the live bindings match the model's
    source values afterward (so a calibration sweep cannot leak into the golden suite — Q1)."""
    unknown = set(overrides) - set(_REGISTRY)
    if unknown:
        raise KeyError(f"not calibration-target parameters: {sorted(unknown)}")

    saved: list[tuple] = []
    try:
        for key, val in overrides.items():
            target, name, kind = _REGISTRY[key]
            if kind == "global":
                old = getattr(target, name)
                setattr(target, name, val)
                saved.append(("global", target, name, old))
            else:
                old = _patch_default(target, name, val)
                saved.append(("default", target, name, old))
        yield
    finally:
        for kind, target, name, old in reversed(saved):
            if kind == "global":
                setattr(target, name, old)
            else:
                _restore_default(target, name, old)
        assert_unpatched()


def assert_unpatched() -> None:
    """Recommend-only / restoration guard (Q1): every live binding equals the model source."""
    for key, expected in _SOURCE_VALUE.items():
        got = current_value(key)
        assert got == expected, (
            f"parameter {key} not restored: live binding {got!r} != source {expected!r}"
        )
