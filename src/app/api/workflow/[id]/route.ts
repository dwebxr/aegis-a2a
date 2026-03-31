import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, removeWorkflow } from "@/services/workflow/registry";
import { listOffers } from "@/services/content/store";
import { log } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const workflow = await getWorkflow(params.id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  return NextResponse.json({ workflow });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Find the offer ID that stores this workflow
  const offers = await listOffers();
  const offer = offers.find(
    (o) => o.title.startsWith("[workflow]") && o.contentHash === `wf-${params.id}`,
  );

  if (!offer) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const deleted = await removeWorkflow(offer.id);
  if (!deleted) {
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 });
  }

  log.info("Workflow deleted", { workflowId: params.id, offerId: offer.id });
  return NextResponse.json({ deleted: true });
}
