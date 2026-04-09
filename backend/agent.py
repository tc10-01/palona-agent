import os
import json
from typing import Optional
import google.generativeai as genai
from catalog import search_products, get_all_categories, get_product_by_id

genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

AGENT_NAME = "Palona Shop Assistant"
CATEGORIES = get_all_categories()

SYSTEM_PROMPT = f"""You are {AGENT_NAME}, a friendly and knowledgeable AI shopping assistant for a modern commerce store.

Your capabilities:
- Answer general questions about yourself and what you can do
- Recommend products based on text descriptions (style, activity, budget, etc.)
- Search for products based on images the user uploads
- Look up full details for a specific product when the user asks for more info

Product catalog categories: {", ".join(CATEGORIES)}

Guidelines:
- Be warm, concise, and helpful
- When your tool returns products, write 1-2 sentences max introducing them — do NOT list product names or prices in your text, the UI displays product cards automatically
- If no products match, suggest the user try different keywords or a related category
- Never make up products — only recommend items returned by your tools
- For general questions (name, capabilities), answer directly without calling any tool
- When showing product details, summarize the key highlights naturally in 2-3 sentences
"""

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
            {
                "name": "get_product_details",
                "description": (
                    "Retrieve full details for a specific product by its ID. "
                    "Use this when the user asks for more information about a specific product they've seen, "
                    "or wants to know specs, materials, or full description of a product."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {
                            "type": "string",
                            "description": "The unique product ID (e.g. 'prod_001')",
                        },
                    },
                    "required": ["product_id"],
                },
            },
        ]
    }
]


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
        return json.dumps({"results": results, "image_description": tool_args["image_description"]})

    elif tool_name == "get_product_details":
        product = get_product_by_id(tool_args["product_id"])
        if product is None:
            return json.dumps({"error": f"No product found with id '{tool_args['product_id']}'"})
        return json.dumps({"product": product})

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


def run_agent(
    message: str,
    history: list[dict],
    image_base64: Optional[str] = None,
    image_mime_type: str = "image/jpeg",
) -> tuple[str, list[dict]]:
    model = genai.GenerativeModel(
        model_name=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        system_instruction=SYSTEM_PROMPT,
        tools=tools,
    )

    user_parts = []
    if image_base64:
        user_parts.append({
            "inline_data": {
                "mime_type": image_mime_type,
                "data": image_base64,
            }
        })
    user_parts.append({"text": message})

    messages = history + [{"role": "user", "parts": user_parts}]
    found_products: list[dict] = []

    while True:
        response = model.generate_content(messages)
        content = response.candidates[0].content

        tool_calls = [
            part for part in content.parts
            if hasattr(part, "function_call") and part.function_call.name
        ]

        if not tool_calls:
            text_parts = [p.text for p in content.parts if hasattr(p, "text") and p.text]
            return "\n".join(text_parts), found_products

        tool_results = []
        for part in tool_calls:
            fc = part.function_call
            tool_output = execute_tool(fc.name, dict(fc.args))
            try:
                parsed = json.loads(tool_output)
                if "results" in parsed and parsed["results"]:
                    found_products = parsed["results"]
                elif "product" in parsed and parsed["product"]:
                    found_products = [parsed["product"]]
            except Exception:
                pass
            tool_results.append({
                "function_response": {
                    "name": fc.name,
                    "response": {"content": tool_output},
                }
            })

        messages.append({"role": "model", "parts": content.parts})
        messages.append({"role": "user", "parts": tool_results})
