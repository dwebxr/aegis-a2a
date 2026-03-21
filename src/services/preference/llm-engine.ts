"use client";

type EngineStatus = "idle" | "loading" | "ready" | "ollama" | "keyword-only" | "error";

interface WebLLMEngine {
  chat: {
    completions: {
      create: (opts: {
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        max_tokens?: number;
      }) => Promise<{ choices: Array<{ message: { content: string } }> }>;
    };
  };
}

let engine: WebLLMEngine | null = null;
let engineStatus: EngineStatus = "idle";
let engineError: string | null = null;
let ollamaReachable = false;

const WEBLLM_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const OLLAMA_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434")
    : "http://localhost:11434";

export function getEngineStatus() {
  return { status: engineStatus, error: engineError };
}

async function checkOllama(): Promise<boolean> {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, {
    signal: AbortSignal.timeout(3_000),
  });
  return res.ok;
}

export async function initEngine(): Promise<boolean> {
  if (engineStatus === "ready" || engineStatus === "ollama") return true;
  if (engineStatus === "loading") return false;

  engineStatus = "loading";
  engineError = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(navigator as any).gpu) {
      throw new Error("WebGPU not available");
    }

    const webllm = await import("@mlc-ai/web-llm");
    engine = await webllm.CreateMLCEngine(WEBLLM_MODEL, {
      initProgressCallback: (progress: { text: string }) => {
        console.log("[WebLLM]", progress.text);
      },
    }) as unknown as WebLLMEngine;

    engineStatus = "ready";
    return true;
  } catch (webllmError) {
    console.warn("[WebLLM] Unavailable, checking Ollama:", webllmError);

    try {
      ollamaReachable = await checkOllama();
    } catch {
      ollamaReachable = false;
    }

    if (ollamaReachable) {
      engineStatus = "ollama";
      engineError = "WebGPU N/A, using Ollama";
      return true;
    }

    engineStatus = "keyword-only";
    engineError = "No LLM available (WebGPU N/A, Ollama unreachable). Using keyword matching.";
    return false;
  }
}

export class LLMUnavailableError extends Error {
  constructor() {
    super("No LLM backend available");
    this.name = "LLMUnavailableError";
  }
}

export async function generateCompletion(prompt: string): Promise<string> {
  if (engine) {
    const result = await engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 512,
    });
    const content = result.choices[0]?.message?.content;
    if (!content) throw new LLMUnavailableError();
    return content;
  }

  if (!ollamaReachable) throw new LLMUnavailableError();

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2:1b",
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 512 },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const data = await response.json();
  if (!data.response) throw new LLMUnavailableError();
  return data.response;
}

export function isReady(): boolean {
  return engineStatus === "ready" || engineStatus === "ollama";
}
