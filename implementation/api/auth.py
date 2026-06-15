"""
Authentication (API contract §2; BB-19/20/24).

One bearer token per athlete; the server **derives `athlete_id` from the token** and never trusts
a client-supplied id (BB-19, no IDOR). Only a **hash** of a high-entropy random token is stored
(BB-20); comparison is constant-time and the lookup is by hash. There is no public registration or
login — tokens are minted out-of-band by the operator path at enrollment (BB-25; §2).

  - `mint_token(conn, athlete_id)`  → returns the PLAINTEXT token once (store the hash); operator
    provisioning (sibling of `HushService.onboard`).
  - `resolve_athlete(conn, token)`  → athlete_id for an active (non-revoked) token, else None.
  - `revoke_token(conn, token)`     → revoke (a revoked token authenticates to nothing → 401).
  - `AuthThrottle`                   → per-source auth-failure throttling (BB-24), to blunt
    token brute-force even without general rate limiting.

A `TOKEN_PEPPER` (env / secrets manager, build plan §11) is mixed into the hash so a DB-only leak
cannot be used to forge tokens. Defaults to empty for tests/dev.

CONCEPTUAL LOCATION: app/auth.py.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading
import time

from hush_model.persistence.db import now_iso

_TOKEN_BYTES = 32  # 256-bit high-entropy token (BB-20)


def _pepper() -> str:
    return os.environ.get("TOKEN_PEPPER", "")


def hash_token(token: str) -> str:
    """SHA-256 of (pepper || token). Stored value; never reversible to the token."""
    return hashlib.sha256((_pepper() + token).encode("utf-8")).hexdigest()


def mint_token(conn, athlete_id: str) -> str:
    """Create a new token for an athlete and persist ONLY its hash. Returns the plaintext token
    once (the caller delivers it over the secure channel — BB-25). Operator-only path."""
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    conn.execute(
        "INSERT INTO auth_token(token_hash, athlete_id, created_at, revoked_at) "
        "VALUES (?,?,?,NULL)",
        (hash_token(token), athlete_id, now_iso()),
    )
    return token


def resolve_athlete(conn, token: str) -> str | None:
    """Return the athlete_id for an ACTIVE token, or None (missing/invalid/revoked → 401).
    Looks up by hash; the row's hash is re-checked in constant time (defense in depth)."""
    if not token:
        return None
    th = hash_token(token)
    row = conn.execute(
        "SELECT token_hash, athlete_id, revoked_at FROM auth_token WHERE token_hash=?",
        (th,),
    ).fetchone()
    if row is None or row["revoked_at"] is not None:
        return None
    if not hmac.compare_digest(row["token_hash"], th):
        return None
    return row["athlete_id"]


def revoke_token(conn, token: str) -> bool:
    """Revoke a token (operator path / rotation). Returns True if a live token was revoked."""
    th = hash_token(token)
    cur = conn.execute(
        "UPDATE auth_token SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
        (now_iso(), th),
    )
    return cur.rowcount > 0


class AuthThrottle:
    """Per-source auth-failure throttling (BB-24). In-memory sliding window; at ~100 users this
    blunts token brute-force without a general rate limiter. Process-local (single-process v1)."""

    def __init__(self, max_failures: int = 20, window_seconds: float = 60.0):
        self.max_failures = max_failures
        self.window = window_seconds
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def is_blocked(self, source: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = [t for t in self._failures.get(source, []) if now - t < self.window]
            self._failures[source] = hits
            return len(hits) >= self.max_failures

    def record_failure(self, source: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = [t for t in self._failures.get(source, []) if now - t < self.window]
            hits.append(now)
            self._failures[source] = hits

    def reset(self, source: str) -> None:
        with self._lock:
            self._failures.pop(source, None)
