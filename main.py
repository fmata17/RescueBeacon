from pathlib import Path
from typing import Literal
import base64
import json

from fastapi import FastAPI, HTTPException
from openai import OpenAI
from pydantic import BaseModel

app = FastAPI(title="RescueBeacon")

# Locate images relative to this script
IMAGE_FOLDER = Path(__file__).resolve().parent / "harris_county_images"

client = OpenAI(
    base_url="http://10.246.100.230/v1",
    api_key="usaadatathon",
    timeout=90,
    max_retries=0,
)


class AssessmentRequest(BaseModel):
    observation_id: str
    image_name: str


class AssessmentResponse(BaseModel):
    observation_id: str
    assessment: Literal["yes", "no", "uncertain"]
    reason: str
    next_action: Literal[
        "notify_response",
        "no_action",
        "request_drone",
    ]


@app.get("/health")
def health():
    return {"status": "ok"}

# Only allow the four demo images
ALLOWED_IMAGES = {
    "flooded_with_cars.png",
    "flooded_with_cars2.png",
    "flooded_with_people.png",
    "not_flooded.png",
}

PROMPT = """
Assess this image for the RescueBeacon demo.
Is assistance needed?

Use these rules:
- yes: Clear visible evidence that someone needs assistance.
- uncertain: Possible danger, but need for assistance cannot be established.
- no: No flooding or other visible danger requiring assistance.

If vehicles are flooded and occupancy cannot be determined,
answer uncertain, not no.
Absence of visible people does not confirm that assistance is unnecessary.
Do not invent people or details.

Return only valid JSON, without Markdown:
{"assessment": "yes", "reason": "Brief explanation of visible evidence."}

The assessment must be exactly "yes", "no", or "uncertain".
"""


@app.post("/assess", response_model=AssessmentResponse)
def assess(request: AssessmentRequest):
    if request.image_name not in ALLOWED_IMAGES:
        raise HTTPException(
            status_code=400,
            detail="Image name must match one of the four demo images.",
        )

    image_path = IMAGE_FOLDER / request.image_name

    if not image_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Image not found: {request.image_name}",
        )

    encoded_image = base64.b64encode(
        image_path.read_bytes()
    ).decode("utf-8")

    try:
        completion = client.chat.completions.create(
            model="qwen3-vl-8b-instruct",
            messages=[
                {
                    "role": "system",
                    "content": PROMPT,
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Assess the attached image.",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": (
                                    "data:image/png;base64,"
                                    + encoded_image
                                )
                            },
                        },
                    ],
                },
            ],
            temperature=0.001,
            max_tokens=500,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Model request failed. Check the backend terminal.",
        ) from exc

    try:
        result = json.loads(
            completion.choices[0].message.content or ""
        )

        assessment = result["assessment"]
        reason = result["reason"]

        if assessment not in {"yes", "no", "uncertain"}:
            raise ValueError("Invalid assessment")

        if not isinstance(reason, str) or not reason.strip():
            raise ValueError("Missing explanation")

    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Model did not return the required JSON format.",
        ) from exc

    actions = {
        "yes": "notify_response",
        "no": "no_action",
        "uncertain": "request_drone",
    }

    return AssessmentResponse(
        observation_id=request.observation_id,
        assessment=assessment,
        reason=reason,
        next_action=actions[assessment],
    )