"""
catalog.py — Product catalog with semantic search via Gemini text-embedding-004.

Search strategy:
  1. Apply hard filters (category, max_price)
  2. Use semantic similarity (cosine of embedding vectors) to rank remaining products
  3. Fall back to keyword scoring if embeddings are unavailable
"""

import json
import math
import os
from typing import Optional

import google.generativeai as genai

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "products.json")
EMBEDDINGS_CACHE_PATH = os.path.join(os.path.dirname(__file__), "data", "embeddings.json")

with open(DATA_PATH) as f:
    PRODUCTS = json.load(f)

# In-memory cache: product_id → embedding vector
_EMBEDDING_CACHE: dict[str, list[float]] = {}


# ── Math helpers ──────────────────────────────────────────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _build_product_text(product: dict) -> str:
    """Combine product fields into a single string for embedding."""
    return " ".join([
        product["name"],
        product["category"],
        product["subcategory"],
        product["description"],
        " ".join(product.get("tags", [])),
    ])


# ── Embedding management ──────────────────────────────────────────────────────

def _embed_text(text: str) -> list[float]:
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_document",
    )
    return result["embedding"]


def ensure_embeddings() -> None:
    """
    Build and cache embeddings for all products.
    Loads existing cache from disk; only computes missing entries.
    Called once at server startup.
    """
    global _EMBEDDING_CACHE

    # Load existing cache
    if os.path.exists(EMBEDDINGS_CACHE_PATH):
        with open(EMBEDDINGS_CACHE_PATH) as f:
            _EMBEDDING_CACHE = json.load(f)

    # Find products that need embeddings
    missing = [p for p in PRODUCTS if p["id"] not in _EMBEDDING_CACHE]

    if not missing:
        print(f"[catalog] Loaded {len(_EMBEDDING_CACHE)} embeddings from cache.")
        return

    print(f"[catalog] Computing embeddings for {len(missing)} products...")
    for product in missing:
        text = _build_product_text(product)
        try:
            _EMBEDDING_CACHE[product["id"]] = _embed_text(text)
        except Exception as e:
            print(f"[catalog] Warning: failed to embed {product['id']}: {e}")

    # Persist updated cache
    with open(EMBEDDINGS_CACHE_PATH, "w") as f:
        json.dump(_EMBEDDING_CACHE, f)

    print(f"[catalog] Embeddings ready ({len(_EMBEDDING_CACHE)} total).")


# ── Search ────────────────────────────────────────────────────────────────────

def search_products(
    query: str,
    category: Optional[str] = None,
    max_price: Optional[float] = None,
    max_results: int = 6,
) -> list[dict]:
    """
    Search the product catalog.
    Uses semantic similarity when embeddings are available; falls back to keyword scoring.
    """
    # Apply hard filters
    candidates = [
        p for p in PRODUCTS
        if (not category or p["category"].lower() == category.lower())
        and (not max_price or p["price"] <= max_price)
    ]

    if not candidates:
        return []

    # ── Semantic path ──────────────────────────────────────────────────────────
    if _EMBEDDING_CACHE:
        try:
            query_vec = genai.embed_content(
                model="models/text-embedding-004",
                content=query,
                task_type="retrieval_query",
            )["embedding"]

            scored = []
            for product in candidates:
                prod_vec = _EMBEDDING_CACHE.get(product["id"])
                if prod_vec:
                    sim = _cosine_similarity(query_vec, prod_vec)
                    scored.append((sim, product))

            if scored:
                scored.sort(key=lambda x: x[0], reverse=True)
                return [p for _, p in scored[:max_results]]
        except Exception as e:
            print(f"[catalog] Semantic search failed, falling back to keywords: {e}")

    # ── Keyword fallback ───────────────────────────────────────────────────────
    query_words = query.lower().split()
    scored = []
    for product in candidates:
        searchable = _build_product_text(product).lower()
        score = sum(1 for word in query_words if word in searchable)
        if score > 0:
            scored.append((score, product))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:max_results]]


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_all_categories() -> list[str]:
    return sorted({p["category"] for p in PRODUCTS})


def get_product_by_id(product_id: str) -> Optional[dict]:
    return next((p for p in PRODUCTS if p["id"] == product_id), None)
