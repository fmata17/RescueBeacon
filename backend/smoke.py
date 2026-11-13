"""One bounded HTTP integration check; no real model calls."""
import base64
import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import httpx
from fastapi.testclient import TestClient
from backend.main import app, IMAGE_FOLDER, MANIFEST_PATH

entries = json.loads(MANIFEST_PATH.read_text())
expected = {"no-flood": ("no", "no"), "assistance": ("yes", "yes"),
            "drone-clear": ("yes", "uncertain"), "operator-review": ("yes", "uncertain")}
by_bytes = {base64.b64encode((IMAGE_FOLDER / item["image"]).read_bytes()).decode(): item["id"] for item in entries}
calls = []


def model_server(request):
    payload = json.loads(request.content)
    encoded = payload["messages"][1]["content"][1]["image_url"]["url"].split(",", 1)[1]
    observation_id = by_bytes[encoded]
    calls.append(observation_id)
    flood, assistance = expected[observation_id]
    result = {stage: {"assessment": value, "confidence": "medium" if value == "uncertain" else "high",
                      "reason": "Controlled model transport result."}
              for stage, value in [("flood", flood), ("assistance", assistance)]}
    return httpx.Response(200, json={"id": "smoke", "object": "chat.completion", "created": 0,
        "model": payload["model"], "choices": [{"index": 0, "finish_reason": "stop",
        "message": {"role": "assistant", "content": json.dumps(result)}}]})


real_http_client = httpx.AsyncClient


class ControlledClient(real_http_client):
    def __init__(self, **kwargs):
        super().__init__(**kwargs, transport=httpx.MockTransport(model_server))


with patch("backend.main.httpx.AsyncClient", ControlledClient), TestClient(app) as api:
    assert api.get("/health").status_code == 200
    for entry in entries:
        for stage, value in zip(("flood", "assistance"), expected[entry["id"]]):
            response = api.post("/api/assessments", json={"observationId": entry["id"], "stage": stage})
            assert response.status_code == 200, response.text
            assert response.json()["finding"] == value
            assert response.json()["source"] == "local-model"
    assert len(calls) == 4, "Each image should be uploaded once for the paired assessments."
    assert api.post("/api/assessments", json={"observationId": "missing", "stage": "flood"}).status_code == 404
print("PASS: four real image files, eight staged responses, four inference calls; unknown image rejected.")
