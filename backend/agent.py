"""
agent.py — The brain of the Palona commerce agent.

Uses Gemini 2.0 Flash with function calling (tool use) to handle:
  1. General conversation ("What's your name?", "What can you do?")
  2. Text-based product search ("Recommend a t-shirt for sports")
  3. Image-based product search (user uploads a photo)

A single agent decides which tool to call — no hardcoded routing.
"""

import os
import base64
import json
from typing import Optional
import google.generativeai as genai
from google.generativeai.types import content_types
from catalog import search_products, get_all_categories

# ── Configure Gemini ──────────────────────────────────────────────────────────
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

AGENT_NAME = "Palona Shop Assistant"
CATEGORIES = get_all_categories()

SYSTEM_PROMPT = f"""You are {AGENT_NAME}, a friendly and knowledgeable AI shopping assistant for a modern commerce store.

Your capabilities:
- Answer general questions about yourself and what you can do
- Recommend products based on text descriptions (style, activity, budget, etc.)
- Search for products based on images the user uploads

Product catalog categories: {", ".join(CATEGORIES)}

Guidelines:
- Be warm, concise, and helpful
- When recommending products, briefly explain WHY each one fits the user's request
- If no products match, suggest the user try different keywords
- Never make up products — only recommend items returned by your tools
- Format product recommendations clearly with name and price
"""

# ── Tool Definitions ──────────────────────────────────────────────────────────
tools = [
    {
        "function_declarations": [
            {
                "name": "search_products_by_text",
                "description": (
                    "Search the product catalog using a text query. Use this when the user asks for "
                    "product recommendations, is looking for something specific, or describes what they want."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query extracted from the user's message (e.g. 'sports t-shirt', 'warm winter jacket')",
                        },
                        "category": {
                            "type": "string",
                            "description": f"Optional product category to filter by. One of: {', '.join(CATEGORIES)}",
                        },
                        "max_price": {
                            "type": "number",
                            "description": "Optional maximum price in USD to filter results",
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "search_products_by_image",
                "description": (
                    "Search the product catalog based on an image the user uploaded. "
                    "Use this when the user provides an image and wants to find similar or matching products."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "image_description": {
                            "type": "string",
                            "description": "A detailed description of the item(s) visible in the image, including type, color, style, and any notable features",
                        },
                        "search_query": {
                            "type": "string",
                            "description": "A concise search query derived from the image to find similar products in the catalog",
                        },
                    },
                    "required": ["image_description", "search_query"],
                },
            },
        ]
    }
]


# ── Tool Execution ─────────────────────────────────────────────────────────────
def execute_tool(tool_name: str, tool_args: dict) -> str:
    if tool_name == "search_products_by_text":
        results = search_products(
            query=tool_args["query"],
            category=tool_args.get("category"),
            max_price=tool_args.get("max_price"),
        )
        if not results:
            return json.dumps({"results": [], "message": "No products found matching the query."})
        return json.dumps({"results": results})

    elif tool_name == "search_products_by_image":
        results = search_products(query=tool_args["search_query"])
        if not results:
            return json.dumps({"results": [], "message": "No similar products found in catalog."})
        return json.dumps({
            "results": results,
            "image_description": tool_args["image_description"],
        })

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


# ── Main Agent Function ────────────────────────────────────────────────────────
def run_agent(
    message: str,
    history: list[dict],
    image_base64: Optional[str] = None,
    image_mime_type: str = "image/jpeg",
) -> str:
    """
    Run one turn of the agent.

    Args:
        message:        User's text message
        history:        Prior conversation turns [{"role": "user"/"model", "parts": [...]}]
        image_base64:   Optional base64-encoded image for image search
        image_mime_type: MIME type of the image

    Returns:
        Agent's text response
    """
    model = genai.GenerativeModel(
        model_name=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        system_instruction=SYSTEM_PROMPT,
        tools=tools,
    )

    # Build current user message (text + optional image)
    user_parts = []
    if image_base64:
        user_parts.append({
            "inline_data": {
                "mime_type": image_mime_type,
                "data": image_base64,
            }
        })
    user_parts.append({"text": message})

    # Combine history with new message
    messages = history + [{"role": "user", "parts": user_parts}]

    # ── Agentic loop: keep going until no more tool calls ──────────────────
    while True:
        response = model.generate_content(messages)
        candidate = response.candidates[0]
        content = candidate.content

        # Check if the model wants to call a tool
        tool_calls = [
            part for part in content.parts
            if hasattr(part, "function_call") and part.function_call.name
        ]

        if not tool_calls:
            # No tool call — extract final text response
            text_parts = [
                part.text for part in content.parts
                if hasattr(part, "text") and part.text
            ]
            return "\n".join(text_parts)

        # Execute each tool call and collect results
        tool_results = []
        for part in tool_calls:
            fc = part.function_call
            tool_output = execute_tool(fc.name, dict(fc.args))
            tool_results.append({
                "function_response": {
                    "name": fc.name,
                    "response": {"content": tool_output},
                }
            })

        # Append model response + tool results to message history and loop
        messages.append({"role": "model", "parts": content.parts})
        messages.append({"role": "user", "parts": tool_results})
