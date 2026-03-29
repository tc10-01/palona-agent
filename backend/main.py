"""
main.py — FastAPI server exposing the Palona commerce agent API.

Endpoints:
  POST /chat          — Text-based conversation and product search
  POST /chat/image    — Image + text for image-based product search
  GET  /products      — Browse the full product catalog
  GET  /health        — Health check
"""

import base64
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from agent import run_agent
from catalog import PRODUCTS, get_all_categories

# ── App Setup ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Palona Commerce Agent API",
    description="AI-powered shopping agent supporting text and image-based product search.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ─────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str  # "user" or "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    history: list[ChatMessage]


# ── History Helpers ───────────────────────────────────────────────────────────
def to_agent_history(history: list[ChatMessage]) -> list[dict]:
    """Convert API history format to Gemini message format."""
    result = []
    for msg in history:
        role = "model" if msg.role == "assistant" else msg.role
        result.append({"role": role, "parts": [{"text": msg.content}]})
    return result


def append_to_history(
    history: list[ChatMessage],
    user_message: str,
    assistant_response: str,
) -> list[ChatMessage]:
    return history + [
        ChatMessage(role="user", content=user_message),
        ChatMessage(role="assistant", content=assistant_response),
    ]


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "agent": "Palona Commerce Agent"}


@app.get("/products")
def list_products(category: Optional[str] = None):
    """Return all products, optionally filtered by category."""
    if category:
        filtered = [p for p in PRODUCTS if p["category"].lower() == category.lower()]
        return {"products": filtered, "total": len(filtered)}
    return {"products": PRODUCTS, "total": len(PRODUCTS)}


@app.get("/products/categories")
def list_categories():
    return {"categories": get_all_categories()}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    """
    Text-based conversation endpoint.
    Handles general chat AND text-based product recommendations.
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    agent_history = to_agent_history(request.history)

    response = run_agent(
        message=request.message,
        history=agent_history,
    )

    updated_history = append_to_history(
        request.history,
        request.message,
        response,
    )

    return ChatResponse(response=response, history=updated_history)


@app.post("/chat/image", response_model=ChatResponse)
async def chat_with_image(
    message: str = Form(default="Find me products similar to this image."),
    history: str = Form(default="[]"),
    file: UploadFile = File(...),
):
    """
    Image + text conversation endpoint.
    User uploads an image; agent finds similar products in the catalog.
    """
    # Validate image type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    # Read and encode image
    image_bytes = await file.read()
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    # Parse history from JSON string (sent as form field)
    import json
    try:
        history_data = json.loads(history)
        parsed_history = [ChatMessage(**m) for m in history_data]
    except Exception:
        parsed_history = []

    agent_history = to_agent_history(parsed_history)

    response = run_agent(
        message=message,
        history=agent_history,
        image_base64=image_base64,
        image_mime_type=file.content_type,
    )

    updated_history = append_to_history(
        parsed_history,
        message,
        response,
    )

    return ChatResponse(response=response, history=updated_history)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
