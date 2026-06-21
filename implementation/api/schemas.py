"""
Request/response DTOs (Pydantic v2) — mirror API_CONTRACT_V1.md §3/§5/§7/§8/§9/§12 exactly.

Field names match the server columns so the audit chain stays traceable end to end (contract §3).
The request models are the **model-input boundary** (BB-8): the frozen model trusts its inputs, so
the API does not. Bounds are enforced here (reps ≥ 0, weight > 0, set_number ≥ 1); the per-set
report **forbids unknown fields** so an effort / RIR / proximity-to-failure field is rejected `422`
rather than silently dropped (contract §16C / ES-011 / A5 Anti-Requirement). Non-input bodies stay
liberal-in for forward-compat (contract §11).

CONCEPTUAL LOCATION: app/schemas.py.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


# ----------------------------- requests (the input boundary, BB-8) -----------------------------

class SessionStartRequest(BaseModel):
    """POST /sessions — no athlete-supplied composition parameters (composition is server-owned
    and load-free; the client cannot influence it). Idempotent on client_request_id."""
    model_config = ConfigDict(extra="ignore")
    client_request_id: str = Field(min_length=1)


class WeekComposeRequest(BaseModel):
    """POST /weeks — generate the current weekly plan. No athlete-supplied composition parameters
    (composition is server-owned + load-free). Idempotent on client_request_id."""
    model_config = ConfigDict(extra="ignore")
    client_request_id: str = Field(min_length=1)


class SetReportRequest(BaseModel):
    """POST /sessions/{id}/sets — the core learning input. `extra="forbid"`: an unknown field
    (effort/RIR/proximity-to-failure) is a model-boundary violation → 422 (contract §7.1/§16C)."""
    model_config = ConfigDict(extra="forbid")
    client_event_id: str = Field(min_length=1)
    seq: int = Field(ge=0)
    block_id: str = Field(min_length=1)
    set_number: int = Field(ge=1)
    actual_reps: int = Field(ge=0)
    # Optional: omitted means the athlete used the prescribed weight (actual_weight ==
    # recommended_weight, the byte-for-byte-preserved default). When present it is the REQUIRED
    # learning input — the load actually lifted (M1/DX-01) — and must be > 0.
    actual_weight: float | None = Field(default=None, gt=0)


class SkipRequest(BaseModel):
    """POST /blocks/{id}/skip — a welcomed first-class path (not a failure). `reason` is free-form
    audit text, NOT a model input."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    seq: int = Field(ge=0)
    reason: str = ""


class ReplaceRequest(BaseModel):
    """POST /blocks/{id}/replace — L2 REPLACE (capability-preserving). In-catalog: when
    `to_exercise` is given it is the athlete's EXACT owned choice and is honored verbatim +
    pinned (Program Ownership Contract); omitted → the model falls back to preference. Off-catalog
    (`off_catalog_text`) is captured verbatim + losslessly for A9."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    seq: int = Field(ge=0)
    from_exercise: str = Field(min_length=1)
    to_exercise: str | None = None
    off_catalog_text: str | None = None
    reason: str = ""


# ----------------------------- Program Ownership Contract: preference actions -----------------------------
# Every athlete preference action is append-only (idempotent on client_event_id) and never alters
# model state — it sets athlete-OWNED program structure (exercise/substitute/backup/order).

class PreferenceExerciseRequest(BaseModel):
    """POST /preferences/exercise — pin (action='replace', honor `to_exercise` exactly) or
    restore (action='restore', clear the pin → the model selects again) the athlete's owned
    exercise for a capability's primary slot."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    capability: str = Field(min_length=1)
    action: str = "replace"            # replace | restore
    from_exercise: str | None = None
    to_exercise: str | None = None
    reason: str = ""
    source: str = "program_detail"


class PreferenceSubstituteRequest(BaseModel):
    """POST /preferences/substitute — define (or remove) a persistent preferred substitute for an
    exercise (e.g. Pull-Up → Lat Pulldown). Preserved across future week generations."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    primary_exercise: str = Field(min_length=1)
    substitute_exercise: str | None = None
    remove: bool = False
    source: str = "program_detail"


class PreferenceBackupRequest(BaseModel):
    """POST /preferences/backup — define (or remove) an equipment-busy backup exercise."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    primary_exercise: str = Field(min_length=1)
    backup_exercise: str | None = None
    remove: bool = False
    source: str = "program_detail"


class PreferenceOrderRequest(BaseModel):
    """POST /preferences/order — athlete-owned exercise order (scope='exercise', within a
    capability) or workout order (scope='workout'). The order list is captured verbatim."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    scope: str = Field(min_length=1)   # exercise | workout
    order: list[str]
    capability: str | None = None
    source: str = "program_detail"


class UnavailableRequest(BaseModel):
    """POST /blocks/{id}/unavailable — equipment-unavailable runtime resolution (use the athlete's
    backup before any model alternative). Idempotent on client_event_id."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    seq: int = Field(default=0, ge=0)
    reason: str = "equipment_unavailable"


class CompleteRequest(BaseModel):
    """POST /sessions/{id}/complete — close (or finish-early). Idempotent on client_event_id."""
    model_config = ConfigDict(extra="ignore")
    client_event_id: str = Field(min_length=1)
    seq: int = Field(default=0, ge=0)
    finished_early: bool = False


class TelemetryEventIn(BaseModel):
    """One client research event (durable, append-only → athlete_event). `data` is small,
    non-sensitive STRUCTURAL context (ids/types/numbers/booleans — never PII). The envelope
    carries a client-generated event_id (idempotent), dual clocks (wall + monotonic) so
    intra-session chronology survives, and device/app context for cohorting."""
    model_config = ConfigDict(extra="ignore")
    event_id: str | None = Field(default=None, max_length=64)
    type: str = Field(min_length=1, max_length=64)
    client_ts: str | None = Field(default=None, max_length=40)
    client_monotonic: float | None = None
    seq: int | None = None
    session_id: str | None = Field(default=None, max_length=128)
    app_version: str | None = Field(default=None, max_length=32)
    os: str | None = Field(default=None, max_length=32)
    device_id: str | None = Field(default=None, max_length=64)
    locale: str | None = Field(default=None, max_length=16)
    network: str | None = Field(default=None, max_length=16)
    data: dict | None = None


class TelemetryRequest(BaseModel):
    """POST /telemetry — a batch of research events. Liberal-in (forward-compat)."""
    model_config = ConfigDict(extra="ignore")
    events: list[TelemetryEventIn] = Field(default_factory=list)


class ProfilePatchRequest(BaseModel):
    """PATCH /profile — correct an onboarding value. Only changed field(s) + client_request_id."""
    model_config = ConfigDict(extra="ignore")
    client_request_id: str = Field(min_length=1)
    sex: str | None = None
    age: int | None = Field(default=None, ge=0)
    experience: str | None = None
    bodyweight_kg: float | None = Field(default=None, gt=0)
    # Training intent (build_muscle|get_stronger|general_fitness|toning). Selects the
    # composition's working-rep target; validated against constants.GOALS in the router.
    goal: str | None = None
    # Chosen weekly training frequency (onboarding days-per-week). Written into the
    # strategy projection; the server clamps to a supported template (2–4).
    weekly_frequency: int | None = Field(default=None, ge=2, le=6)


class ConsentRequest(BaseModel):
    """POST /consent — record the athlete's affirmative consent to a VERSIONED agreement. Enrollment
    is operator-mediated (an operator cannot consent on the athlete's behalf), so the athlete records
    consent IN-APP (pressing Continue on Enrollment is the affirmative act). Append-only + idempotent
    on a deterministic id; the server_ts is the authoritative legal timestamp, `accepted_at` is the
    client wall-clock kept for audit."""
    model_config = ConfigDict(extra="ignore")
    version: str = Field(min_length=1, max_length=64)
    accepted_at: str | None = Field(default=None, max_length=40)
    client_event_id: str | None = Field(default=None, max_length=64)


# ----------------------------- responses (wire DTOs, contract §3) -----------------------------

class BlockOut(BaseModel):
    id: str
    position: int
    capability: str
    exercise: str
    difficulty_factor: float
    recommended_weight: float            # advisory (DX-18); the athlete owns load
    target_reps: int
    target_sets: int
    rest_seconds: int
    selection_reason: str
    recommendation_id: str | None = None
    status: str


class SessionOut(BaseModel):
    id: str
    status: str
    week: float
    session_index: int | None = None
    started_at: str | None = None
    completed_at: str | None = None
    model_version: str
    capability_model_version: str
    catalog_version: str
    blocks: list[BlockOut] = []


class CapabilityStateOut(BaseModel):
    capability: str
    score: float
    confidence: float


class StrategyStateOut(BaseModel):
    weekly_frequency: int
    weekly_volume: str
    primary_focus: str | None = None
    secondary_focus: str | None = None


class AthleteOut(BaseModel):
    id: str
    sex: str
    age: int
    experience: str
    bodyweight_kg: float | None = None
    goal: str | None = None
    model_version: str
    capability_model_version: str
