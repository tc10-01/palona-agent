"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useDropzone } from "react-dropzone";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STORAGE_KEY_MESSAGES = "palona_messages";
const STORAGE_KEY_HISTORY = "palona_history";

type Role = "user" | "assistant";

interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  description: string;
  image_url: string;
  colors: string[];
  tags: string[];
}

interface Message {
  role: Role;
  content: string;
  imagePreview?: string;
  products?: Product[];
}

interface HistoryItem {
  role: Role;
  content: string;
}

const COLOR_MAP: Record<string, string> = {
  black: "#111827", white: "#f9fafb", navy: "#1e3a5f", red: "#dc2626",
  blue: "#3b82f6", grey: "#9ca3af", gray: "#9ca3af", green: "#16a34a",
  "forest green": "#166534", brown: "#92400e", beige: "#d4b896",
  olive: "#71773e", pink: "#ec4899", burgundy: "#881337", sage: "#6b9e75",
  caramel: "#b45309", "dark blue": "#1e40af", "light blue": "#93c5fd",
  tortoise: "#8b5e3c", natural: "#d4c9a8", pacific: "#0891b2",
  flamingo: "#fb7185", midnight: "#312e81", starlight: "#f1f5f9",
  denim: "#5b7fa6", taupe: "#b5a49b",
};

function colorHex(c: string) {
  return COLOR_MAP[c.toLowerCase()] ?? "#e5e7eb";
}

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="group flex-shrink-0 w-40 rounded-2xl overflow-hidden bg-white border border-slate-100 hover:border-violet-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer">
      <div className="relative h-40 bg-slate-50 overflow-hidden">
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/160x160?text=·"; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-2.5">
          <span className="text-white text-xs font-bold">${product.price.toFixed(2)}</span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2 mb-2 min-h-[2rem]">
          {product.name}
        </p>
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-bold text-violet-600">${product.price.toFixed(2)}</p>
          <div className="flex gap-1">
            {product.colors.slice(0, 4).map((c, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: colorHex(c) }}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden bg-white border border-slate-100 hover:border-violet-200 shadow-sm hover:shadow-xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="h-44 bg-slate-50 overflow-hidden">
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/200x200?text=·"; }}
        />
      </div>
      <div className="p-3">
        <span className="text-xs text-slate-400 capitalize">{product.category}</span>
        <p className="text-sm font-semibold text-slate-800 leading-tight mt-0.5 line-clamp-1">{product.name}</p>
        <p className="text-sm font-bold text-violet-600 mt-1">${product.price.toFixed(2)}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [thinkingText, setThinkingText] = useState("Thinking…");
  const [categories, setCategories] = useState<string[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (savedMessages) {
        setMessages((JSON.parse(savedMessages) as Message[]).map((m) => ({
          ...m,
          imagePreview: m.imagePreview?.startsWith("blob:") ? undefined : m.imagePreview,
        })));
      }
      const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (savedHistory) setHistory(JSON.parse(savedHistory));
    } catch { /* storage unavailable */ }
    setHydrated(true);
  }, []);

  // Persist to localStorage on change (only after hydration to avoid overwriting saved data)
  useEffect(() => {
    if (!hydrated) return;
    try {
      const toSave = messages.map((m) => ({
        ...m,
        imagePreview: m.imagePreview?.startsWith("blob:") ? undefined : m.imagePreview,
      }));
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(toSave));
    } catch { /* storage full or disabled */ }
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history)); }
    catch { /* storage full or disabled */ }
  }, [history, hydrated]);

  useEffect(() => {
    fetch(`${API}/products/categories`)
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});

    fetch(`${API}/products`)
      .then((r) => r.json())
      .then((d) => setFeatured((d.products ?? []).slice(0, 4)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    maxFiles: 1,
    noClick: true,
    onDrop: (files) => { if (files[0]) attachImage(files[0]); },
  });

  function attachImage(file: File) {
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setPendingImage(null);
    setImagePreview(null);
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text && !pendingImage) return;

    const userMessage: Message = {
      role: "user",
      content: text || "Find me products similar to this image.",
      imagePreview: imagePreview ?? undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setThinkingText(pendingImage ? "Analyzing image…" : "Searching catalog…");

    const imgFile = pendingImage;
    setPendingImage(null);
    setImagePreview(null);

    try {
      let data: { response: string; history: HistoryItem[]; products: Product[] };

      if (imgFile) {
        const form = new FormData();
        form.append("message", userMessage.content);
        form.append("history", JSON.stringify(history));
        form.append("file", imgFile);
        const res = await fetch(`${API}/chat/image`, { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
        data = await res.json();
      } else {
        const res = await fetch(`${API}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage.content, history }),
        });
        if (!res.ok) throw new Error(await res.text());
        data = await res.json();
      }

      setHistory(data.history);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          products: data.products?.length ? data.products : undefined,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div {...getRootProps()} className="flex h-screen bg-slate-50 overflow-hidden">
      <input {...getInputProps()} />

      {/* ── Sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 bg-[#0f172a] text-white flex-shrink-0">
        <div className="flex flex-col flex-1 overflow-y-auto p-5 gap-5">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center font-bold text-sm shadow-lg shadow-violet-900/50">
              P
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">Palona</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span className="text-xs text-slate-400">Shop Assistant</span>
              </div>
            </div>
          </div>

          {/* New chat */}
          <button
            onClick={() => {
              setMessages([]);
              setHistory([]);
              localStorage.removeItem(STORAGE_KEY_MESSAGES);
              localStorage.removeItem(STORAGE_KEY_HISTORY);
            }}
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white border border-slate-700/60 hover:border-slate-500 rounded-xl px-3 py-2.5 transition-all hover:bg-slate-800/50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New conversation
          </button>

          <div className="h-px bg-slate-800" />

          {/* Quick search */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Quick search
            </p>
            <div className="space-y-0.5">
              {[
                { icon: "🏃", text: "Sports t-shirt" },
                { icon: "🧥", text: "Jacket under $100" },
                { icon: "🎒", text: "Backpacks" },
                { icon: "👟", text: "Running shoes" },
                { icon: "💡", text: "What can you do?" },
              ].map((s) => (
                <button
                  key={s.text}
                  onClick={() => sendMessage(s.text)}
                  className="w-full flex items-center gap-2.5 text-left text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="text-sm">{s.icon}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                Browse
              </p>
              <div className="space-y-0.5">
                {categories.sort().map((cat) => (
                  <button
                    key={cat}
                    onClick={() => sendMessage(`Show me ${cat} products`)}
                    className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg px-3 py-2 transition-colors capitalize"
                  >
                    <span>{cat}</span>
                    <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar footer */}
        <div className="p-4 border-t border-slate-800">
          <p className="text-xs text-slate-500">
            <span className="text-slate-300 font-medium">50</span> products ·{" "}
            <span className="text-slate-300 font-medium">{categories.length}</span> categories
          </p>
          <p className="text-xs text-slate-600 mt-0.5">Gemini 2.5 Flash</p>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0f172a] text-white flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center font-bold text-xs">P</div>
          <p className="font-semibold text-sm">Palona</p>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Online
          </span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center gap-10 px-6 py-10">
              <div className="text-center max-w-lg">
                <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-100 text-violet-600 text-xs font-medium px-3 py-1.5 rounded-full mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                  AI-powered shopping
                </div>
                <h1 className="text-4xl font-bold text-slate-900 leading-tight tracking-tight">
                  Find exactly{" "}
                  <span className="bg-gradient-to-r from-violet-600 to-indigo-500 bg-clip-text text-transparent">
                    what you need
                  </span>
                </h1>
                <p className="text-slate-500 mt-3 text-base max-w-sm mx-auto leading-relaxed">
                  Search by text or upload a photo. I'll find the best matches and explain why they fit.
                </p>
              </div>

              {featured.length > 0 && (
                <div className="w-full max-w-2xl">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 text-center">
                    Featured
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {featured.map((p) => (
                      <FeaturedCard
                        key={p.id}
                        product={p}
                        onClick={() => sendMessage(`Tell me about the ${p.name}`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {["Sports t-shirt", "Warm jacket under $100", "Backpacks", "Running shoes", "What can you do?"].map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-sm bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 text-slate-600 rounded-full px-4 py-2 transition-all shadow-sm hover:shadow"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5 shadow-sm shadow-violet-200">
                      P
                    </div>
                  )}
                  <div className="flex flex-col gap-3 max-w-[80%]">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-tr-sm shadow-sm shadow-violet-200/50"
                          : "bg-white text-slate-800 rounded-tl-sm shadow-sm border border-slate-100"
                      }`}
                    >
                      {msg.imagePreview && (
                        <img src={msg.imagePreview} alt="uploaded" className="w-full max-w-xs rounded-xl mb-2 object-cover" />
                      )}
                      {msg.role === "assistant" ? (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc ml-4 space-y-1 mt-1">{children}</ul>,
                            li: ({ children }) => <li>{children}</li>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : msg.content}
                    </div>

                    {msg.products && msg.products.length > 0 && (
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {msg.products.map((p) => (
                          <ProductCard key={p.id} product={p} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-violet-200">
                    P
                  </div>
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-3">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs text-slate-400">{thinkingText}</span>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {isDragActive && (
          <div className="fixed inset-0 bg-violet-500/10 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white rounded-3xl px-10 py-8 shadow-2xl text-center border-2 border-dashed border-violet-400">
              <p className="text-4xl mb-3">📸</p>
              <p className="text-violet-700 font-semibold text-lg">Drop to search by image</p>
              <p className="text-slate-400 text-sm mt-1">I'll find similar items in the catalog</p>
            </div>
          </div>
        )}

        {/* ── Input ── */}
        <div className="px-4 py-4 bg-white border-t border-slate-100">
          <div className="max-w-2xl mx-auto">
            {imagePreview && (
              <div className="relative inline-block mb-2">
                <img src={imagePreview} alt="preview" className="h-14 w-14 rounded-xl object-cover border border-slate-200 shadow-sm" />
                <button
                  onClick={removeImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors"
                >✕</button>
              </div>
            )}

            <div className="flex gap-2 items-end bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-violet-300 focus-within:bg-white focus-within:shadow-sm transition-all">
              <label className="flex-shrink-0 cursor-pointer text-slate-400 hover:text-violet-500 transition-colors mb-0.5">
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) attachImage(e.target.files[0]); }} />
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </label>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pendingImage ? "Add a note or just press Enter…" : "Ask me anything or drop an image…"}
                rows={1}
                className="flex-1 resize-none outline-none text-sm text-slate-800 placeholder:text-slate-400 max-h-32 leading-relaxed bg-transparent"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = el.scrollHeight + "px";
                }}
              />

              <button
                onClick={() => sendMessage()}
                disabled={loading || (!input.trim() && !pendingImage)}
                className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity mb-0.5 shadow-sm shadow-violet-300"
              >
                <svg className="w-4 h-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-center text-xs text-slate-400 mt-2">
              Enter to send · Shift+Enter for new line · Drop or attach images
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
