import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.main import create_app


@pytest.fixture
def anon_client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id="00000000-0000-0000-0000-000000000001", email="test@example.com", role="authenticated"
    )
    return TestClient(app)
