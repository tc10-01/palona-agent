# Palona Commerce Agent

An AI-powered shopping assistant for a commerce website, built as part of the Palona AI take-home exercise.

Inspired by [Amazon Rufus](https://www.aboutamazon.com/news/retail/amazon-rufus), this agent handles general conversation, text-based product recommendations, and image-based product search — all through a **single unified agent**.

---

## Demo

> 🎥 *(Add demo GIF here)*

---

## Features

| Feature | Description |
|---|---|
| 💬 General conversation | "What's your name?", "What can you do?" |
| 🔍 Text product search | "Recommend a t-shirt for sports", "Warm jacket under $100" |
| 🖼️ Image product search | Upload a photo → agent finds similar items in the catalog |
| 🗂️ Multi-turn memory | Conversation history preserved across turns |
| 📎 Drag & drop images | Drop an image anywhere on the chat window |

---

## Architecture

```
┌─────────────────────────────────────────┐
│           Next.js Frontend              │
│  ChatWindow · ImageUpload · Markdown    │
└──────────────────┬──────────────────────┘
                   │ HTTP (REST)
┌──────────────────▼──────────────────────┐
│           FastAPI Backend               │
│   POST /chat   POST /chat/image         │
│   GET  /products  GET /health           │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│           Gemini Agent (agent.py)        │
│                                         │
│  System prompt + 2 registered tools     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Tool: search_products_by_text   │    │
│  │ Tool: search_products_by_image  │    │
│  └──────────────┬──────────────────┘    │
└─────────────────┼───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        Product Catalog (catalog.py)      │
│        25 products · JSON · keyword search│
└─────────────────────────────────────────┘
```

### Why a single agent with tools?

Rather than routing user intent with `if/elif` blocks, the agent uses **Gemini's function calling** (tool use). The model reads the user's message, decides which tool is appropriate, calls it, and synthesizes the result into a natural response.

This means:
- **No brittle intent classification** — the LLM handles ambiguity
- **Composable** — new tools (e.g. `check_inventory`, `get_deals`) can be added without touching routing logic
- **Natural multi-turn conversations** — the agent can ask clarifying questions before searching

### Image search flow

```
User uploads image
       ↓
Gemini Vision describes the item (color, type, style)
       ↓
Tool: search_products_by_image(image_description, search_query)
       ↓
Keyword search over catalog tags + descriptions
       ↓
Gemini formats results, explains matches
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| LLM | Gemini 2.0 Flash | Free tier, fast, native vision + function calling |
| Backend | FastAPI (Python) | Auto OpenAPI docs, async, clean type hints |
| Frontend | Next.js 14 + Tailwind | Production-grade React, easy Vercel deploy |
| Catalog | JSON flat file | Simple, auditable, no DB overhead for a demo |

---

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A [Gemini API key](https://aistudio.google.com/app/apikey)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export GEMINI_API_KEY=your_key_here
python main.py
```

API will be running at `http://localhost:8000`  
Interactive docs at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Frontend will be running at `http://localhost:3000`

---

## API Reference

### `POST /chat`
Text-based conversation and product search.

**Request:**
```json
{
  "message": "Recommend me a sports t-shirt",
  "history": []
}
```

**Response:**
```json
{
  "response": "Here are some great options for a sports t-shirt...",
  "history": [
    { "role": "user", "content": "Recommend me a sports t-shirt" },
    { "role": "assistant", "content": "Here are some great options..." }
  ]
}
```

### `POST /chat/image`
Image + text conversation. Sent as `multipart/form-data`.

| Field | Type | Description |
|---|---|---|
| `file` | File | Image to search by |
| `message` | string | Optional text message |
| `history` | JSON string | Serialized conversation history |

### `GET /products`
Returns the full product catalog. Accepts optional `?category=` filter.

### `GET /health`
Health check endpoint.

Full interactive docs available at `/docs` when the backend is running.

---

## Product Catalog

25 curated products across 6 categories: clothing, footwear, bags, accessories, electronics, home, beauty.

Each product has: name, category, subcategory, tags, price, colors, sizes, description, image URL.

---

## Deployment

### Backend → Railway
```bash
# Add GEMINI_API_KEY as environment variable in Railway dashboard
# Set start command to: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend → Vercel
```bash
# Set NEXT_PUBLIC_API_URL to your Railway backend URL
vercel deploy
```
