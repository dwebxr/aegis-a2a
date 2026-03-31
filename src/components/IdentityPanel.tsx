"use client";

import { useState, useRef } from "react";
import { useIdentity } from "@/hooks/useIdentity";
import type { IdentityPackage } from "@/types/identity";

export function IdentityPanel() {
  const {
    keyPair,
    did,
    isGenerating,
    generate,
    exportIdentity,
    verifyImport,
    clearIdentity,
    wasCorrupted,
  } = useIdentity();

  const [importResult, setImportResult] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [backupPassword, setBackupPassword] = useState("");
  const [showBackup, setShowBackup] = useState(false);

  const handleEncryptedBackup = async () => {
    if (!keyPair || !backupPassword) return;
    const { encryptKeyBackup } = await import("@/services/identity/keybackup");
    const backup = await encryptKeyBackup(
      keyPair.privateKey,
      keyPair.publicKey,
      keyPair.did,
      backupPassword,
    );
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-key-backup-${keyPair.did.slice(-8)}.enc.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupPassword("");
    setShowBackup(false);
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !backupPassword) return;
    const text = await file.text();
    const backup = JSON.parse(text);
    const { decryptKeyBackup } = await import("@/services/identity/keybackup");
    const restored = await decryptKeyBackup(backup, backupPassword);
    const kpData = { ...restored, created: Date.now() };
    localStorage.setItem("aegis-identity", JSON.stringify({
      publicKey: Array.from(kpData.publicKey),
      privateKey: Array.from(kpData.privateKey),
      did: kpData.did,
      created: kpData.created,
    }));
    window.location.reload();
  };

  const handleExport = async () => {
    if (!did) return;
    const pkg = await exportIdentity(
      {
        displayName: "Agent",
        agentId: "local-agent",
        platforms: ["aegis-a2a"],
      },
      [],
      ["publish", "purchase"],
    );
    if (pkg) {
      const json = JSON.stringify(pkg, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aegis-identity-${did.slice(-8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const pkg = JSON.parse(text) as IdentityPackage;
      const result = await verifyImport(pkg);
      setImportResult(result);
    } catch {
      setImportResult({ valid: false, error: "Invalid identity file" });
    }
  };

  return (
    <div className="bg-gray-900/60 border border-gray-800/50 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-gray-300 tracking-tight">
          Agent Identity
        </h3>
        {did && (
          <span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-md">
            DID Active
          </span>
        )}
      </div>

      {wasCorrupted && (
        <div className="text-[10px] text-amber-400/80 bg-amber-900/20 rounded-lg px-3 py-1.5 mb-3">
          Previous identity data was corrupted and has been cleared. Generate a new one.
        </div>
      )}

      {!did ? (
        <button
          onClick={generate}
          disabled={isGenerating}
          className="w-full bg-blue-600/80 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-medium py-2 rounded-lg transition-colors"
        >
          {isGenerating ? "Generating..." : "Generate DID Identity"}
        </button>
      ) : (
        <div className="space-y-2">
          {/* DID display */}
          <div className="bg-gray-800/50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">Your DID</p>
            <p className="text-[11px] text-gray-300 font-mono break-all leading-relaxed">
              {did.slice(0, 20)}...{did.slice(-12)}
            </p>
          </div>

          {/* Created */}
          {keyPair && (
            <p className="text-[10px] text-gray-600">
              Created: {new Date(keyPair.created).toLocaleDateString()}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 bg-gray-800 border border-gray-700/50 hover:bg-gray-700 text-gray-300 text-[11px] py-1.5 rounded-lg transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-gray-800 border border-gray-700/50 hover:bg-gray-700 text-gray-300 text-[11px] py-1.5 rounded-lg transition-colors"
            >
              Verify Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </div>

          {/* Import result */}
          {importResult && (
            <div
              className={`text-[10px] px-2 py-1 rounded-lg ${
                importResult.valid
                  ? "bg-green-900/30 text-green-400"
                  : "bg-red-900/30 text-red-400"
              }`}
            >
              {importResult.valid
                ? "Identity verified successfully"
                : `Verification failed: ${importResult.error}`}
            </div>
          )}

          {/* Encrypted backup — private key never leaves browser unencrypted */}
          <button
            onClick={() => setShowBackup(!showBackup)}
            className="w-full text-[10px] text-gray-500 hover:text-gray-300 py-1 transition-colors"
          >
            {showBackup ? "Hide" : "Encrypted Backup"}
          </button>
          {showBackup && (
            <div className="space-y-1.5 bg-gray-800/30 rounded-lg px-3 py-2">
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Encryption password"
                className="w-full bg-gray-900/50 border border-gray-700/30 rounded px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEncryptedBackup}
                  disabled={!backupPassword}
                  className="flex-1 bg-blue-600/60 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-[10px] py-1 rounded transition-colors"
                >
                  Backup
                </button>
                <label className="flex-1 bg-gray-700/60 hover:bg-gray-600 text-gray-300 text-[10px] py-1 rounded transition-colors text-center cursor-pointer">
                  Restore
                  <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* Danger zone */}
          <button
            onClick={() => {
              if (confirm("This will delete your DID key pair. Are you sure?")) {
                clearIdentity();
              }
            }}
            className="w-full text-[10px] text-gray-700 hover:text-red-400 py-1 transition-colors"
          >
            Reset Identity
          </button>
        </div>
      )}

      <p className="text-[10px] text-gray-700 mt-3">
        Keys are stored locally in your browser. Export for backup.
      </p>
    </div>
  );
}
