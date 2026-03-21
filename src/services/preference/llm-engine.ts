"use client";

type EngineStatus = "idle" | "loading" | "ready" | "fallback" | "error";

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

const WEBLLM_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const OLLAMA_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434")
    : "http://localhost:11434";

export function getEngineStatus() {
  return { status: engineStatus, error: engineError };
}

export async function initEngine(): Promise<boolean> {
  if (engineStatus === "ready" || engineStatus === "fallback") return true;
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
  } catch (error) {
    console.warn("[WebLLM] Unavailable, using Ollama fallback:", error);
    engineStatus = "fallback";
    engineError = error instanceof Error ? error.message : "WebLLM init failed";
    return false;
  }
}

export async function generateCompletion(prompt: string): Promise<string> {
  if (engine) {
    try {
      const result = await engine.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 512,
      });
      return result.choices[0]?.message?.content || "";
    } catch (error) {
      console.warn("[WebLLM] Inference failed, trying Ollama:", error);
    }
  }

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:1b",
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 512 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();
    return data.response || "";
  } catch (error) {
    console.warn("[Ollama] Fallback also failed:", error);
    return "";
  }
}

export function isReady(): boolean {
  return engineStatus === "ready" || engineStatus === "fallback";
}
