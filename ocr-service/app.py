from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from schedule_ocr.recognizer import recognize_schedule_image


app = FastAPI(title="StayUp Schedule OCR Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/recognize")
async def recognize(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        return recognize_schedule_image(image_bytes)
    except Exception as exc:  # noqa: BLE001 - service should return actionable errors to the app.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
