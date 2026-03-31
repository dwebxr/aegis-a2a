import { NextRequest, NextResponse } from "next/server";
import { getWorkflow } from "@/services/workflow/registry";
import { validateWorkflow } from "@/services/workflow/validator";
import { executeWorkflow } from "@/services/workflow/runner";
import { ensureHandlersRegistered } from "@/services/workflow/handlers";
import { isRateLimited } from "@/lib/rate-limit";
import { pushEvent } from "@/services/activity/aggregator";
import { generateId } from "@/lib/utils";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(`workflow-exec:${ip}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const workflowId = params.id;
  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Workflow template is invalid", errors: validation.errors },
      { status: 422 },
    );
  }

  let context: Record<string, unknown> = {};
  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      context = body as Record<string, unknown>;
    }
  } catch {
    // No body or invalid JSON — proceed with empty context
  }

  ensureHandlersRegistered();

  const execution = await executeWorkflow(workflow, context);

  // Emit activity event
  pushEvent({
    id: generateId(),
    type: "policy_applied" as const, // reuse for workflow execution events
    timestamp: Date.now(),
    actorId: workflow.author,
    summary: `Workflow "${workflow.name}" ${execution.status} (${execution.stepResults.length} steps)`,
    metadata: {
      workflowId: workflow.id,
      executionId: execution.id,
      status: execution.status,
      steps: execution.stepResults.length,
      failed: execution.stepResults.filter((r) => r.status === "failed").length,
    },
  });

  const status = execution.status === "completed" ? 200 : 422;
  return NextResponse.json({ execution }, { status });
}
