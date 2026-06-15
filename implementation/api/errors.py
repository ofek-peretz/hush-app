"""
Error envelope + HTTP mapping (API contract §15).

Every non-2xx response uses the one envelope shape `{"error": {code, message, request_id, field?}}`.
`code` is the stable machine string clients branch on; `message` is human-readable and may change.
The taxonomy (§15.2) maps a small set of `ApiError`s onto HTTP status + code; FastAPI's handler
renders the envelope. The athlete never sees a raw error (calm-to-athlete, Mobile Arch §14) — these
are for the device's sync engine and operator telemetry.

CONCEPTUAL LOCATION: app/errors.py.
"""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

from . import observability


def _request_id() -> str:
    """The envelope's `request_id` is the request's correlation id (BB-28) when one is bound, so a
    client-visible error ties straight to the server access log and the `X-Correlation-Id` header.
    Falls back to a freshly minted id outside a request (e.g. a direct unit test)."""
    return observability.current_correlation_id() or observability.new_correlation_id()


class ApiError(Exception):
    """A contract error. `status` is the HTTP code, `code` the stable taxonomy string (§15.2)."""

    def __init__(self, status: int, code: str, message: str, field: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field = field

    def to_response(self) -> JSONResponse:
        body: dict = {
            "error": {
                "code": self.code,
                "message": self.message,
                "request_id": _request_id(),
            }
        }
        if self.field is not None:
            body["error"]["field"] = self.field
        return JSONResponse(status_code=self.status, content=body)


# --- taxonomy constructors (§15.2) -------------------------------------------------

def bad_request(message: str, field: str | None = None) -> ApiError:
    return ApiError(400, "bad_request", message, field)


def unauthenticated(message: str = "token absent, invalid, or revoked") -> ApiError:
    return ApiError(401, "unauthenticated", message)


def forbidden(message: str = "resource belongs to another athlete") -> ApiError:
    return ApiError(403, "forbidden", message)


def not_found(message: str = "resource does not exist") -> ApiError:
    return ApiError(404, "not_found", message)


def conflict(message: str) -> ApiError:
    return ApiError(409, "conflict", message)


def unprocessable(message: str, field: str | None = None) -> ApiError:
    """422 — well-formed but rejects a MODEL-BOUNDARY input (effort/RIR field, inactive
    capability, off-catalog where a catalog code was required). Permanent; never strip-and-resend."""
    return ApiError(422, "unprocessable", message, field)


def rate_limited(message: str = "too many requests") -> ApiError:
    return ApiError(429, "rate_limited", message)


def register_exception_handlers(app) -> None:
    """Wire the envelope onto FastAPI: ApiError → its mapped status; Pydantic/validation →
    422 unprocessable (model-boundary); anything else → 500 server_error."""
    from fastapi.exceptions import RequestValidationError

    @app.exception_handler(ApiError)
    async def _api_error(_req: Request, exc: ApiError):  # noqa: ANN001
        return exc.to_response()

    @app.exception_handler(RequestValidationError)
    async def _validation(_req: Request, exc: RequestValidationError):  # noqa: ANN001
        # A malformed/invalid body that fails DTO validation is a model-boundary rejection.
        first = exc.errors()[0] if exc.errors() else {}
        loc = first.get("loc", [])
        field = str(loc[-1]) if loc else None
        msg = first.get("msg", "request failed validation")
        return unprocessable(msg, field).to_response()

    @app.exception_handler(Exception)
    async def _unhandled(_req: Request, exc: Exception):  # noqa: ANN001
        return ApiError(500, "server_error", "internal error").to_response()
