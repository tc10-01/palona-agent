import json
import os
from typing import Optional

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "products.json")

with open(DATA_PATH) as f:
    PRODUCTS = json.load(f)


def search_products(
    query: str,
    category: Optional[str] = None,
    max_price: Optional[float] = None,
    max_results: int = 5,
) -> list[dict]:
    """
    Simple keyword + filter search over the product catalog.
    Scores each product by how many query words match its name, tags, and description.
    """
    query_words = query.lower().split()
    scored = []

    for product in PRODUCTS:
        # Apply hard filters first
        if category and product["category"].lower() != category.lower():
            continue
        if max_price and product["price"] > max_price:
            continue

        # Score by keyword overlap
        searchable = " ".join([
            product["name"],
            product["category"],
            product["subcategory"],
            product["description"],
            " ".join(product["tags"]),
        ]).lower()

        score = sum(1 for word in query_words if word in searchable)

        if score > 0:
            scored.append((score, product))

    # Sort by score descending, return top results
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:max_results]]


def get_all_categories() -> list[str]:
    return list({p["category"] for p in PRODUCTS})


def get_product_by_id(product_id: str) -> Optional[dict]:
    return next((p for p in PRODUCTS if p["id"] == product_id), None)
