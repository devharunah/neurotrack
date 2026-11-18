"""NeuroTrack API entry point.

Called server-to-server by the Next.js app, never directly from browsers, so CORS stays off.
"""

from importlib.metadata import version

from fastapi import FastAPI

from app.quantum.router import router as quantum_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="NeuroTrack API",
        version="0.1.0",
        description="Scientific computation for NeuroTrack. Educational and experimental; "
        "not a clinical tool.",
    )

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "qiskit": version("qiskit"), "qiskit_aer": version("qiskit-aer")}

    app.include_router(quantum_router)
    return app


app = create_app()
