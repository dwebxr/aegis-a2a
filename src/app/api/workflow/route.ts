import { NextRequest, NextResponse } from "next/server";
import { listWorkflows, publishWorkflow } from "@/services/workflow/registry";
import { validateWorkflow } from "@/services/workflow/validator";
import { isRateLimited } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import type { WorkflowStep } from "@/types/workflow";
import type { PolicyRule } from "@/types/policy";

export async function GET() {
  try {
    const workflows = await listWorkflows();
    return NextResponse.json({ workflows });
  } catch (err) {
    log.error("GET /api/workflow failed", { error: String(err) });
    return NextResponse.json(
      { error: "Failed to fetch workflows" },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(`workflow:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, author, authorDid, steps, requiredPolicies, tags, forkedFrom } = body;

  if (!name || typeof name !== "string" || !author || typeof author !== "string" || !Array.isArray(steps)) {
    return NextResponse.json(
      { error: "Missing required fields: name, author, steps" },
      { status: 400 },
    );
  }

  if (!steps.every((s) => typeof s === "object" && s !== null && "id" in s && "type" in s && "name" in s)) {
    return NextResponse.json(
      { error: "Each step must have id, type, and name" },
      { status: 400 },
    );
  }

  // Validate the template structure
  const template = {
    id: "temp",
    name,
    description: (typeof description === "string" ? description : "") || "",
    author,
    authorDid: typeof authorDid === "string" ? authorDid : undefined,
    steps: steps as WorkflowStep[],
    requiredPolicies: Array.isArray(requiredPolicies) ? (requiredPolicies as PolicyRule[]) : undefined,
    tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [],
    version: 1,
    forkedFrom: typeof forkedFrom === "string" ? forkedFrom : undefined,
    rating: { sum: 0, count: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const validation = validateWorkflow(template);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid workflow template", errors: validation.errors },
      { status: 400 },
    );
  }

  try {
    const published = await publishWorkflow({
      name: template.name,
      description: template.description,
      author: template.author,
      authorDid: template.authorDid,
      steps: template.steps,
      requiredPolicies: template.requiredPolicies,
      tags: template.tags,
      version: template.version,
      rating: template.rating,
    });

    return NextResponse.json(
      { workflowId: published.id },
      { status: 201 },
    );
  } catch (err) {
    log.error("POST /api/workflow failed", { error: String(err) });
    return NextResponse.json(
      { error: "Failed to publish workflow" },
      { status: 500 },
    );
  }
}
