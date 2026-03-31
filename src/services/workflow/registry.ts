import type { WorkflowTemplate } from "@/types/workflow";
import type { Offer } from "@/types/offer";
import { addOffer, listOffers, removeOffer } from "@/services/content/store";
import { generateId } from "@/lib/utils";

const WORKFLOW_MARKER = "[workflow]";

// Workflows are stored as special offers in the canister with a title marker
export async function publishWorkflow(
  template: Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<WorkflowTemplate> {
  const now = Date.now();
  const full: WorkflowTemplate = { ...template, id: generateId(), createdAt: now, updatedAt: now };

  await addOffer({
    agentId: full.author,
    title: `${WORKFLOW_MARKER} ${full.name}`,
    description: full.description,
    priceUsdc: 0,
    contentHash: `wf-${full.id}`,
    supportedChains: ["base", "solana", "icp"],
    encryptedContent: JSON.stringify(full),
    topics: full.tags,
  });

  return full;
}

export async function listWorkflows(): Promise<WorkflowTemplate[]> {
  const offers = await listOffers();
  return offers
    .filter((o) => o.title.startsWith(WORKFLOW_MARKER))
    .map(extractWorkflowFromOffer)
    .filter((w): w is WorkflowTemplate => w !== null);
}

export async function getWorkflow(workflowId: string): Promise<WorkflowTemplate | null> {
  const offers = await listOffers();
  const offer = offers.find(
    (o) => o.title.startsWith(WORKFLOW_MARKER) && o.contentHash === `wf-${workflowId}`,
  );
  if (!offer) return null;
  return extractWorkflowFromOffer(offer);
}

export async function removeWorkflow(offerId: string): Promise<boolean> {
  return removeOffer(offerId);
}

export function forkWorkflow(
  original: WorkflowTemplate,
  newAuthor: string,
  newAuthorDid?: string,
): Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt"> {
  return {
    name: `${original.name} (fork)`,
    description: original.description,
    author: newAuthor,
    authorDid: newAuthorDid,
    steps: structuredClone(original.steps),
    requiredPolicies: original.requiredPolicies ? structuredClone(original.requiredPolicies) : undefined,
    tags: [...original.tags],
    version: 1,
    forkedFrom: original.id,
    rating: { sum: 0, count: 0 },
  };
}

function extractWorkflowFromOffer(offer: Offer): WorkflowTemplate | null {
  try {
    if (!offer.encryptedContent) return null;
    return JSON.parse(offer.encryptedContent) as WorkflowTemplate;
  } catch {
    return null;
  }
}
