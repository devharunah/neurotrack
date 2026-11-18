import base64
import json
import logging

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.config import Settings
from app.main import create_app
from app.middleware import TokenBucketLimiter, jwt_subject, rate_limit_key


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "rate_limit_burst": 5,
        "rate_limit_per_minute": 60,
        "rate_limit_strict_burst": 2,
        "rate_limit_strict_per_minute": 6,
        "max_body_bytes": 1024,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _client(settings: Settings, *, raise_server_exceptions: bool = True) -> TestClient:
    app = create_app(settings)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id="00000000-0000-0000-0000-000000000001", email="t@example.com", role="authenticated"
    )
    boom = APIRouter()

    @boom.get("/boom")
    def explode() -> None:
        raise RuntimeError("secret internal detail")

    app.include_router(boom)
    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def _fake_jwt(sub: str) -> str:
    def enc(obj: dict[str, object]) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    return f"{enc({'alg': 'none'})}.{enc({'sub': sub})}.sig"


def test_429_after_burst_with_retry_after() -> None:
    client = _client(_settings())
    for _ in range(2):
        assert client.get("/quantum/presets").status_code == 200
    response = client.get("/quantum/presets")
    assert response.status_code == 429
    retry_after = response.headers["retry-after"]
    assert int(retry_after) >= 1
    # Security headers and request ID are also on rejected responses.
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-request-id"]


def test_default_bucket_is_looser_than_strict() -> None:
    client = _client(_settings())
    # /openapi.json is outside the strict prefixes, so it gets the burst of 5.
    statuses = [client.get("/openapi.json").status_code for _ in range(6)]
    assert statuses == [200] * 5 + [429]


def test_health_is_never_rate_limited() -> None:
    client = _client(_settings(rate_limit_burst=1))
    assert all(client.get("/health").status_code == 200 for _ in range(5))


def test_rate_limit_key_uses_sub() -> None:
    client = _client(_settings())
    alice = {"Authorization": f"Bearer {_fake_jwt('alice')}"}
    bob = {"Authorization": f"Bearer {_fake_jwt('bob')}"}
    for _ in range(2):
        assert client.get("/quantum/presets", headers=alice).status_code == 200
    assert client.get("/quantum/presets", headers=alice).status_code == 429
    # Same IP, different subject: separate bucket.
    assert client.get("/quantum/presets", headers=bob).status_code == 200


def test_rate_limit_key_function() -> None:
    scope = {
        "type": "http",
        "headers": [(b"authorization", f"Bearer {_fake_jwt('user-123')}".encode())],
        "client": ("10.0.0.1", 1234),
    }
    assert jwt_subject(scope) == "user-123"
    assert rate_limit_key(scope, trust_proxy_headers=False) == "sub:user-123"

    anon = {
        "type": "http",
        "headers": [(b"authorization", b"Bearer junk")],
        "client": ("10.0.0.1", 1),
    }
    assert rate_limit_key(anon, trust_proxy_headers=False) == "ip:10.0.0.1"

    proxied = {
        "type": "http",
        "headers": [(b"x-forwarded-for", b"203.0.113.9, 10.0.0.2")],
        "client": ("10.0.0.2", 1),
    }
    assert rate_limit_key(proxied, trust_proxy_headers=True) == "ip:203.0.113.9"
    assert rate_limit_key(proxied, trust_proxy_headers=False) == "ip:10.0.0.2"


def test_token_bucket_refills() -> None:
    now = [0.0]
    limiter = TokenBucketLimiter(capacity=2, per_minute=60, clock=lambda: now[0])
    assert limiter.take("k") == 0
    assert limiter.take("k") == 0
    wait = limiter.take("k")
    assert wait == pytest.approx(1.0)
    now[0] += 1.0
    assert limiter.take("k") == 0


def test_token_bucket_table_is_bounded() -> None:
    limiter = TokenBucketLimiter(capacity=1, per_minute=1, max_keys=3)
    for i in range(10):
        limiter.take(f"k{i}")
    assert len(limiter._buckets) == 3


def test_413_on_oversized_body() -> None:
    client = _client(_settings())
    response = client.post(
        "/quantum/run",
        content=b"x" * 2048,
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413
    assert response.headers["x-request-id"]


def test_413_on_streamed_body_without_content_length() -> None:
    client = _client(_settings())

    def chunks():
        for _ in range(4):
            yield b"x" * 512

    response = client.post(
        "/quantum/run", content=chunks(), headers={"content-type": "application/json"}
    )
    assert response.status_code == 413


def test_small_body_passes_size_limit() -> None:
    client = _client(_settings(max_body_bytes=4096))
    body = {"num_qubits": 1, "gates": [{"op": "x", "target": 0}], "shots": 10}
    assert client.post("/quantum/run", json=body).status_code == 200


def test_security_headers_present() -> None:
    client = _client(_settings())
    headers = client.get("/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in headers["content-security-policy"]
    assert headers["cache-control"] == "no-store"
    assert "strict-transport-security" not in headers


def test_hsts_in_production_only() -> None:
    client = _client(_settings(environment="production", allowed_hosts=["testserver"]))
    assert "max-age=" in client.get("/health").headers["strict-transport-security"]


def test_docs_are_not_blocked_by_csp() -> None:
    client = _client(_settings())
    assert "content-security-policy" not in client.get("/docs").headers


def test_request_id_is_echoed_when_safe_and_replaced_when_not() -> None:
    client = _client(_settings())
    assert (
        client.get("/health", headers={"x-request-id": "abc-123"}).headers["x-request-id"]
        == "abc-123"
    )
    replaced = client.get("/health", headers={"x-request-id": "bad id\twith junk"}).headers
    assert replaced["x-request-id"] != "bad id\twith junk"
    assert len(replaced["x-request-id"]) == 32


def test_unhandled_exception_hides_stack_trace(caplog: pytest.LogCaptureFixture) -> None:
    client = _client(_settings(), raise_server_exceptions=False)
    response = client.get("/boom")
    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "Internal server error"
    assert body["request_id"] == response.headers["x-request-id"]
    assert "secret internal detail" not in response.text
    assert "Traceback" not in response.text


def test_trusted_hosts() -> None:
    client = _client(_settings(allowed_hosts=["api.example.org"]))
    assert client.get("/health").status_code == 400
    assert client.get("/health", headers={"host": "api.example.org"}).status_code == 200


def test_production_refuses_wildcard_hosts() -> None:
    with pytest.raises(ValueError, match="ALLOWED_HOSTS"):
        Settings(environment="production", allowed_hosts=["*"])


def test_access_log_is_json_without_secrets(capsys: pytest.CaptureFixture[str]) -> None:
    # Re-bind the JSON handler to this test's captured stdout.
    logging.getLogger("neurotrack.access").handlers.clear()
    client = _client(_settings())
    token = _fake_jwt("alice")
    client.get("/health?token=leak", headers={"Authorization": f"Bearer {token}"})
    lines = [line for line in capsys.readouterr().out.splitlines() if '"neurotrack.access"' in line]
    assert lines, "expected a JSON access-log line on stdout"
    entry = json.loads(lines[-1])
    assert entry["path"] == "/health"
    assert entry["status"] == 200
    assert entry["request_id"]
    assert token not in lines[-1]
    assert "leak" not in lines[-1]
