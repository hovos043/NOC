from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.routers import accounts, audit_logs, codex, diagnostics, saved_commands, servers, settings as settings_router, terminal, terminal_ws
from app.services.migrations import CURRENT_SCHEMA_VERSION, backup_database_once_per_day, verify_phase2_schema
from app.services.local_auth import verify_request_token
from app.services.monitoring_scheduler import start_monitoring_scheduler
from app.services.seed import seed_initial_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        backup_database_once_per_day("startup-backup")
        verify_phase2_schema(db)
        seed_initial_data(db)
    finally:
        db.close()
    stop_event = asyncio.Event()
    scheduler_task = asyncio.create_task(start_monitoring_scheduler(stop_event))
    yield
    stop_event.set()
    await scheduler_task


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_local_auth(request: Request, call_next) -> Response:
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path.startswith("/api"):
        try:
            verify_request_token(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


app.include_router(servers.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(terminal.router, prefix="/api")
app.include_router(saved_commands.router, prefix="/api")
app.include_router(audit_logs.router, prefix="/api")
app.include_router(diagnostics.router, prefix="/api")
app.include_router(codex.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(terminal_ws.router)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "schema_version": CURRENT_SCHEMA_VERSION,
        "storage": "local_sqlite",
        "features": {
            "account_notes": True,
            "local_auth": True,
        },
    }
