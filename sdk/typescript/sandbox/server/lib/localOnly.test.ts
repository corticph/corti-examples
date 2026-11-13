import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedRequest } from "./localOnly";

describe("isAllowedRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows same-origin requests to loopback hosts", () => {
    expect(isAllowedRequest("localhost:8080", "http://localhost:8080")).toBe(true);
    expect(isAllowedRequest("127.0.0.1:3000", "http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedRequest("[::1]:3000", "http://[::1]:3000")).toBe(true);
    expect(isAllowedRequest("localhost", "https://localhost")).toBe(true);
  });

  it("allows requests without an Origin header", () => {
    expect(isAllowedRequest("localhost:8080", undefined)).toBe(true);
  });

  it("rejects cross-site requests", () => {
    expect(isAllowedRequest("localhost:8080", "https://evil.example")).toBe(false);
    expect(isAllowedRequest("localhost:8080", "http://localhost:3000")).toBe(false);
    expect(isAllowedRequest("localhost:8080", "null")).toBe(false);
  });

  it("rejects non-loopback hosts (DNS rebinding)", () => {
    expect(isAllowedRequest("evil.example:8080", "http://evil.example:8080")).toBe(false);
    expect(isAllowedRequest("localhost.evil.example", undefined)).toBe(false);
    expect(isAllowedRequest(undefined, undefined)).toBe(false);
  });

  it("allows extra hosts from ALLOWED_HOSTS", () => {
    vi.stubEnv("ALLOWED_HOSTS", "sandbox.lan, 192.168.1.20");
    expect(isAllowedRequest("sandbox.lan:3000", "http://sandbox.lan:3000")).toBe(true);
    expect(isAllowedRequest("192.168.1.20:3000", undefined)).toBe(true);
    expect(isAllowedRequest("other.lan:3000", undefined)).toBe(false);
  });
});
