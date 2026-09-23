"""Authenticated loopback worker; MLX runs on one dedicated thread."""
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
import secrets

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from .models import LayaRanker

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / ".runtime/token").read_text().strip()
executor = ThreadPoolExecutor(max_workers=1)
models = {}
busy = False


async def on_model_thread(fn, *args):
    return await asyncio.get_running_loop().run_in_executor(executor, fn, *args)


@asynccontextmanager
async def lifespan(app):
    models["laya"] = await on_model_thread(LayaRanker, ROOT / "models/laya")
    await on_model_thread(models["laya"].rank, "汽车", "youxiang", ["油箱", "邮箱", "又想"])
    yield
    executor.shutdown(wait=False)


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class Request(BaseModel):
    context: str = Field(max_length=256)
    pinyin: str = Field(max_length=128)
    candidates: list[str] = Field(min_length=2, max_length=8)
    backend: str = "laya"

    @field_validator("candidates")
    @classmethod
    def validate_candidates(cls, values):
        if any(not value or len(value) > 64 for value in values) or len(set(values)) != len(values):
            raise ValueError("Candidates must be unique, nonempty and at most 64 characters")
        return values


def authenticate(authorization):
    if not secrets.compare_digest(authorization or "", f"Bearer {TOKEN}"):
        raise HTTPException(401, "Unauthorized")


@app.get("/health")
async def health():
    return {"ready": bool(models), "backends": list(models), "busy": busy}


@app.post("/rank")
async def rank(request: Request, authorization: str | None = Header(default=None)):
    global busy
    authenticate(authorization)
    if request.backend not in models:
        raise HTTPException(400, "Unavailable backend")
    if busy:
        raise HTTPException(503, "Model is busy")
    busy = True
    # Keep ownership until native inference finishes, even if the client times out.
    task = asyncio.create_task(on_model_thread(
        models[request.backend].rank, request.context, request.pinyin, request.candidates
    ))
    def finished(_):
        global busy
        busy = False
    task.add_done_callback(finished)
    return await asyncio.shield(task)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("LIME_JEV_WORKER_PORT", "17865")), access_log=False)
