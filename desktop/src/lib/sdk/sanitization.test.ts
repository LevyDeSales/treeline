import { describe, it, expect, beforeEach } from "bun:test";
import { sanitizeHtml } from "./sanitization";

describe("sanitizeHtml fallback", () => {
  it("should return empty string when window/DOMParser is missing", () => {
    // In Bun environment, window and DOMParser are missing by default
    const input = '<h1>Safe</h1><script>alert(1)</script>';
    const output = sanitizeHtml(input);
    expect(output).toBe("");
  });
});
