# Palona Commerce Agent

AI shopping assistant built for the Palona take-home. Handles general conversation, text search, and image-based search through a single Gemini agent with function calling — no hardcoded intent routing.

---

## Features

- General conversation ("what can you do?", "what's your name?")
- Text-based product search with semantic ranking (not keyword matching)
- Image upload — agent describes the item and finds similar products
- Product detail lookup by ID
- Conversation history persisted to localStorage across page reloads
- Drag and drop image upload

---

## How it works

The frontend sends messages to a FastAPI backend, which passes them to a Gemini agent. The agent decides which tool to call (or none, for general questions), executes it, and returns a response with any matched products.

```
Next.js frontend
      ↓ HTTP
FastAPI backend  →  Gemini agent (gemini-2.5-flash)
                         ↓ function calling
                    search_products_by_text
                    search_products_by_image
                    get_product_details
                         ↓
                    catalog.py  (50 products, semantic search)
```

Products are embedded once at startup using `text-embedding-004` and cached to `data/embeddings.json`. Search ranks results by cosine similarity. Falls back to keyword scoring if embeddings aren't available.

---

## Stack

- **LLM**: Gemini 2.5 Flash (vision + function calling)
- **Embeddings**: text-embedding-004
- **Backend**: FastAPI + Python
- **Frontend**: Next.js 14 + Tailwind CSS

---

## Running locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey)

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:
```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

```bash
python main.py
```

First run computes embeddings for all 50 products (~30 seconds). After that it loads from cache instantly.

API runs at `http://localhost:8000` — interactive docs at `/docs`.

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Frontend at `http://localhost:3000`.

---

## API

### POST /chat
```json
{ "message": "show me running shoes under $100", "history": [] }
```

Returns `response` (text), `products` (array), `history` (updated).

### POST /chat/image
Multipart form: `file` (image), `message` (string), `history` (JSON string).

### GET /products
Full catalog. Optional `?category=` filter.

### GET /products/categories
List of all categories.

### GET /health
Health check.

---

## Deployment

### Backend → Railway
- Root directory: `backend/`
- Environment variable: `GEMINI_API_KEY`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Frontend → Vercel
- Root directory: `frontend/`
- Environment variable: `NEXT_PUBLIC_API_URL` → your Railway URL

---

## Live demo

Frontend: https://palona-agent.vercel.app

Backend API docs: https://palona-agent-production.up.railway.app/docs

If the hosted demo is unavailable, follow the local setup instructions above with your own Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey).
