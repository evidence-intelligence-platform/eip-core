from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from src.main import app
from src.db.database import get_session

sqlite_url = "sqlite://" # In-memory database
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def get_session_override():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_session] = get_session_override
client = TestClient(app)

def setup_module():
    SQLModel.metadata.create_all(engine)

def teardown_module():
    SQLModel.metadata.drop_all(engine)

def test_create_and_list_candidates():
    # Create candidate
    resp = client.post("/api/v1/candidates/", json={
        "external_id": "cand_1",
        "name": "Jane Doe"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Jane Doe"

    # List candidates
    resp = client.get("/api/v1/candidates/")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

def test_create_and_list_requirements():
    # Create requirement
    resp = client.post("/api/v1/requirements/", json={
        "external_id": "req_1",
        "description": "Python Expert"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["description"] == "Python Expert"

    # List requirements
    resp = client.get("/api/v1/requirements/")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
