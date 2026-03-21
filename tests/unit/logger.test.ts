import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "@/lib/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("log.error writes JSON to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("disk full");

    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.level).toBe("error");
    expect(output.msg).toBe("disk full");
    expect(output.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("log.warn writes JSON to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("high latency");

    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.level).toBe("warn");
    expect(output.msg).toBe("high latency");
  });

  it("log.info writes JSON to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("server started");

    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.level).toBe("info");
    expect(output.msg).toBe("server started");
  });

  it("log.debug writes JSON to console.debug", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    log.debug("trace data");

    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.level).toBe("debug");
  });

  it("includes extra data fields in JSON output", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("failed to write", { file: "/tmp/x", err: "ENOSPC" });

    const output = JSON.parse(spy.mock.calls[0][0]);
    expect(output.file).toBe("/tmp/x");
    expect(output.err).toBe("ENOSPC");
    expect(output.msg).toBe("failed to write");
  });

  it("produces valid JSON on every call", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("with special chars: \"quotes\" and \nnewlines");

    expect(() => JSON.parse(spy.mock.calls[0][0])).not.toThrow();
  });
});
