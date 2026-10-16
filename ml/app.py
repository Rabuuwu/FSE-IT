"""Internal ML API: Core authenticates requests and exposes a minimal user dataset."""
import asyncio
import hmac
import json
import os
from urllib.request import Request, urlopen
from urllib.error import URLError
from fastapi import FastAPI, Header, HTTPException
from ml.model import recommend

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def dataset(user_id, token):
    base = os.environ.get("CORE_INTERNAL_URL", "http://127.0.0.1:3000").rstrip("/")
    request = Request(f"{base}/internal/recommendation-data/{user_id}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(request, timeout=2) as response:
            # Bound responses; large deployments need a capped training snapshot/batch model.
            body = response.read(10_000_001)
            if len(body) > 10_000_000:
                raise ValueError("Dataset limit exceeded")
            return json.loads(body)
    except (URLError, ValueError, TimeoutError) as exc:
        raise HTTPException(503, "Recommendation data unavailable") from exc


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/recommendations/{user_id}")
async def recommendations(user_id: int, authorization: str = Header(default="")):
    token = os.environ.get("ML_SERVICE_TOKEN", "")
    if len(token) < 32 or not hmac.compare_digest(authorization.encode(), f"Bearer {token}".encode()):
        raise HTTPException(401, "Service authentication required")
    if not 0 < user_id <= 2147483647:
        raise HTTPException(400, "Invalid identifier")
    data = await asyncio.to_thread(dataset, user_id, token)
    return await asyncio.to_thread(recommend, data["materials"], data["activity"])
