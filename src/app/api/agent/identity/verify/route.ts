import { NextRequest, NextResponse } from "next/server";
import { verifyIdentityPackage } from "@/services/identity/export";
import { verifyCredential } from "@/services/identity/credentials";
import { isValidDID } from "@/services/identity/resolver";
import { log } from "@/lib/logger";
import type { IdentityPackage } from "@/types/identity";

export async function POST(req: NextRequest) {
  let pkg: IdentityPackage;
  try {
    pkg = (await req.json()) as IdentityPackage;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!pkg.did || !isValidDID(pkg.did)) {
    return NextResponse.json(
      { error: "Invalid or missing DID in package" },
      { status: 400 },
    );
  }

  try {
    // Verify package signature
    const packageResult = await verifyIdentityPackage(pkg);
    if (!packageResult.valid) {
      return NextResponse.json(
        { valid: false, error: `Package signature invalid: ${packageResult.error}` },
        { status: 422 },
      );
    }

    // Verify each credential
    const credentialResults = await Promise.all(
      pkg.credentials.map(async (cred, i) => {
        const result = await verifyCredential(cred);
        return { index: i, type: cred.type, ...result };
      }),
    );

    const invalidCredentials = credentialResults.filter((r) => !r.valid);

    return NextResponse.json({
      valid: invalidCredentials.length === 0,
      packageVerified: true,
      credentials: credentialResults,
      profile: pkg.profile,
    });
  } catch (err) {
    log.error("Identity verification failed", { did: pkg.did, error: String(err) });
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 },
    );
  }
}
