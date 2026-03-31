import { NextRequest, NextResponse } from "next/server";
import { resolveDID, isValidDID } from "@/services/identity/resolver";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const did = searchParams.get("did");

  if (!did) {
    return NextResponse.json(
      { error: "Missing required parameter: did" },
      { status: 400 },
    );
  }

  if (!isValidDID(did)) {
    return NextResponse.json(
      { error: "Invalid DID format. Only did:key is supported." },
      { status: 400 },
    );
  }

  try {
    const document = resolveDID(did);
    return NextResponse.json({ document });
  } catch (err) {
    log.error("DID resolution failed", { did, error: String(err) });
    return NextResponse.json(
      { error: "Failed to resolve DID" },
      { status: 500 },
    );
  }
}
