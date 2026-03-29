import base64
import json
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from agent import run_agent
from catalog import PRODUCTS, get_all_categories, ensure_embeddings


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, ensure_embeddings)
    yield


app = FastAPI(
    title="Palona Commerce Agent API",
    description="AI-powered shopping agent supporting text and image-based product search.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    history: list[ChatMessage]
    products: list[dict] = []


def to_agent_history(history: list[ChatMessage]) -> list[dict]:
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


@app.get("/health")
def health():
    return {"status": "ok", "agent": "Palona Commerce Agent"}


@app.get("/products")
def list_products(category: Optional[str] = None):
    if category:
        filtered = [p for p in PRODUCTS if p["category"].lower() == category.lower()]
        return {"products": filtered, "total": len(filtered)}
    return {"products": PRODUCTS, "total": len(PRODUCTS)}


@app.get("/products/categories")
def list_categories():
    return {"categories": get_all_categories()}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    agent_history = to_agent_history(request.history)
    response, products = run_agent(message=request.message, history=agent_history)
    updated_history = append_to_history(request.history, request.message, response)

    return ChatResponse(response=response, history=updated_history, products=products)


@app.post("/chat/image", response_model=ChatResponse)
async def chat_with_image(
    message: str = Form(default="Find me products similar to this image."),
    history: str = Form(default="[]"),
    file: UploadFile = File(...),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    image_bytes = await file.read()
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    try:
        parsed_history = [ChatMessage(**m) for m in json.loads(history)]
    except Exception:
        parsed_history = []

    agent_history = to_agent_history(parsed_history)
    response, products = run_agent(
        message=message,
        history=agent_history,
        image_base64=image_base64,
        image_mime_type=file.content_type,
    )
    updated_history = append_to_history(parsed_history, message, response)

    return ChatResponse(response=response, history=updated_history, products=products)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
