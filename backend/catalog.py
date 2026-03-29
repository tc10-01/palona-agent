import json
import math
import os
from typing import Optional

import google.generativeai as genai

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "products.json")
EMBEDDINGS_CACHE_PATH = os.path.join(os.path.dirname(__file__), "data", "embeddings.json")

with open(DATA_PATH) as f:
    PRODUCTS = json.load(f)

_EMBEDDING_CACHE: dict[str, list[float]] = {}


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _build_product_text(product: dict) -> str:
    return " ".join([
        product["name"],
        product["category"],
        product["subcategory"],
        product["description"],
        " ".join(product.get("tags", [])),
    ])


def _embed_text(text: str) -> list[float]:
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        task_type="retrieval_document",
    )
    return result["embedding"]


def ensure_embeddings() -> None:
    global _EMBEDDING_CACHE

    if os.path.exists(EMBEDDINGS_CACHE_PATH):
        with open(EMBEDDINGS_CACHE_PATH) as f:
            _EMBEDDING_CACHE = json.load(f)

    missing = [p for p in PRODUCTS if p["id"] not in _EMBEDDING_CACHE]

    if not missing:
        print(f"[catalog] {len(_EMBEDDING_CACHE)} embeddings loaded from cache.")
        return

    print(f"[catalog] Computing embeddings for {len(missing)} products...")
    for product in missing:
        try:
            _EMBEDDING_CACHE[product["id"]] = _embed_text(_build_product_text(product))
        except Exception as e:
            print(f"[catalog] Warning: couldn't embed {product['id']}: {e}")

    with open(EMBEDDINGS_CACHE_PATH, "w") as f:
        json.dump(_EMBEDDING_CACHE, f)

    print(f"[catalog] Done ({len(_EMBEDDING_CACHE)} total).")


def search_products(
    query: str,
    category: Optional[str] = None,
    max_price: Optional[float] = None,
    max_results: int = 6,
) -> list[dict]:
    candidates = [
        p for p in PRODUCTS
        if (not category or p["category"].lower() == category.lower())
        and (not max_price or p["price"] <= max_price)
    ]

    if not candidates:
        return []

    if _EMBEDDING_CACHE:
        try:
            query_vec = genai.embed_content(
                model="models/text-embedding-004",
                content=query,
                task_type="retrieval_query",
            )["embedding"]

            scored = [
                (_cosine_similarity(query_vec, _EMBEDDING_CACHE[p["id"]]), p)
                for p in candidates if p["id"] in _EMBEDDING_CACHE
            ]
            if scored:
                scored.sort(key=lambda x: x[0], reverse=True)
                return [p for _, p in scored[:max_results]]
        except Exception as e:
            print(f"[catalog] Semantic search failed, falling back to keywords: {e}")

    # keyword fallback
    query_words = query.lower().split()
    scored = []
    for product in candidates:
        score = sum(1 for w in query_words if w in _build_product_text(product).lower())
        if score > 0:
            scored.append((score, product))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:max_results]]


def get_all_categories() -> list[str]:
    return sorted({p["category"] for p in PRODUCTS})


def get_product_by_id(product_id: str) -> Optional[dict]:
    return next((p for p in PRODUCTS if p["id"] == product_id), None)
