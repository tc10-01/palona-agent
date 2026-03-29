"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useDropzone } from "react-dropzone";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
  imagePreview?: string; // local object URL for display
}

interface HistoryItem {
  role: Role;
  content: string;
}

// ── Suggested prompts shown before first message ──────────────────────────────
const SUGGESTIONS = [
  "Recommend me a t-shirt for sports 🏃",
  "I need a warm jacket under $100",
  "What backpacks do you have?",
  "What's your name and what can you do?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Image drop zone ──────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    maxFiles: 1,
    noClick: true,
    onDrop: (files) => {
      if (files[0]) attachImage(files[0]);
    },
  });

  function attachImage(file: File) {
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setPendingImage(null);
    setImagePreview(null);
  }

  // ── Send message ─────────────────────────────────────────────────────────
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

    // Optimistically clear image
    const imgFile = pendingImage;
    setPendingImage(null);
    setImagePreview(null);

    try {
      let data: { response: string; history: HistoryItem[] };

      if (imgFile) {
        // Image endpoint — send as multipart form
        const form = new FormData();
        form.append("message", userMessage.content);
        form.append("history", JSON.stringify(history));
        form.append("file", imgFile);

        const res = await fetch(`${API}/chat/image`, { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
        data = await res.json();
      } else {
        // Text endpoint
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
        { role: "assistant", content: data.response },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
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
    <div
      {...getRootProps()}
      className="flex flex-col h-screen max-w-3xl mx-auto px-4"
    >
      <input {...getInputProps()} />

      {/* ── Header ── */}
      <header className="flex items-center gap-3 py-4 border-b border-slate-200">
        <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
          P
        </div>
        <div>
          <h1 className="font-semibold text-slate-900 leading-tight">Palona Shop Assistant</h1>
          <p className="text-xs text-slate-500">Powered by Gemini · Ask me anything</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Online
        </span>
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center text-white text-3xl shadow-lg">
              🛍️
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-800">How can I help you shop today?</h2>
              <p className="text-slate-500 text-sm mt-1">
                Ask me for recommendations, search by text, or drop an image to find similar items.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-brand-500 hover:bg-brand-50 transition-colors text-slate-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-brand-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-1">
                  P
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand-500 text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
                }`}
              >
                {msg.imagePreview && (
                  <img
                    src={msg.imagePreview}
                    alt="uploaded"
                    className="w-full max-w-xs rounded-lg mb-2 object-cover"
                  />
                )}
                {msg.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc ml-4 space-y-1">{children}</ul>,
                      li: ({ children }) => <li>{children}</li>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
              P
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-5">
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Drop overlay */}
        {isDragActive && (
          <div className="fixed inset-0 bg-brand-500/10 border-2 border-dashed border-brand-500 rounded-2xl z-50 flex items-center justify-center">
            <p className="text-brand-700 font-medium text-lg">Drop image to search</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="py-4 border-t border-slate-200">
        {/* Image preview */}
        {imagePreview && (
          <div className="relative inline-block mb-2">
            <img src={imagePreview} alt="preview" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-brand-500 transition-colors">
          {/* Image attach button */}
          <label className="flex-shrink-0 cursor-pointer text-slate-400 hover:text-brand-500 transition-colors mb-0.5">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) attachImage(e.target.files[0]);
              }}
            />
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </label>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingImage ? "Describe what you're looking for... (or just press Enter)" : "Ask me anything or drop an image..."}
            rows={1}
            className="flex-1 resize-none outline-none text-sm text-slate-800 placeholder:text-slate-400 max-h-32 leading-relaxed"
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
            className="flex-shrink-0 w-8 h-8 rounded-xl bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-0.5"
          >
            <svg className="w-4 h-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">
          Press Enter to send · Shift+Enter for new line · Drop or attach images
        </p>
      </div>
    </div>
  );
}
