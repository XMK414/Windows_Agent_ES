import { describe, it, expect } from "vitest";
import { buildCorsAllowList } from "./auth-middleware.js";

describe("buildCorsAllowList", () => {
  it("allows 127.0.0.1 and localhost on the dev and preview ports", () => {
    const list = buildCorsAllowList({});
    expect(list.has("http://127.0.0.1:5173")).toBe(true);
    expect(list.has("http://localhost:5173")).toBe(true);
    expect(list.has("http://127.0.0.1:4173")).toBe(true);
    expect(list.has("http://localhost:4173")).toBe(true);
  });

  it("includes extra origins from WAES_WEB_ORIGIN and WAES_WEB_ORIGINS", () => {
    const list = buildCorsAllowList({
      WAES_WEB_ORIGIN: "http://127.0.0.1:8080",
      WAES_WEB_ORIGINS: "https://app.example.test, http://localhost:3000",
    });
    expect(list.has("http://127.0.0.1:8080")).toBe(true);
    expect(list.has("https://app.example.test")).toBe(true);
    expect(list.has("http://localhost:3000")).toBe(true);
  });

  it("does not include arbitrary origins", () => {
    const list = buildCorsAllowList({});
    expect(list.has("http://evil.example")).toBe(false);
  });
});
