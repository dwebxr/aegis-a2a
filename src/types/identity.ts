export interface AgentDID {
  did: string;
  publicKeyMultibase: string;
  created: number;
}

export interface VerifiableCredential {
  "@context": string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    [key: string]: unknown;
  };
  proof?: CredentialProof;
}

export interface CredentialProof {
  type: "Ed25519Signature2020";
  verificationMethod: string;
  created: string;
  proofValue: string;
}

export interface AgentProfile {
  displayName: string;
  agentId: string;
  platforms: string[];
}

export interface IdentityPackage {
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://aegis.dwebxr.xyz/ns/a2a/v1",
  ];
  did: string;
  created: string;
  profile: AgentProfile;
  credentials: VerifiableCredential[];
  preferences: {
    topics: string[];
  };
  capabilities: string[];
  proof: CredentialProof;
}

export interface DIDDocument {
  "@context": string[];
  id: string;
  verificationMethod: Array<{
    id: string;
    type: "Ed25519VerificationKey2020";
    controller: string;
    publicKeyMultibase: string;
  }>;
  authentication: string[];
  assertionMethod: string[];
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  did: string;
  created: number;
}
