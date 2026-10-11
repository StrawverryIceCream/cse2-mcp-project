import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createRequireAuth, safeEqual } from "../src/credentials.js";

const TOKEN = "header-token-for-tests";
const KEY = "k".repeat(40);

function makeReq(opts: { authorization?: string; query?: Record<string, unknown> } = {}): Request {
  return {
    headers: opts.authorization === undefined ? {} : { authorization: opts.authorization },
    query: opts.query ?? {},
  } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function attempt(
  secrets: { authToken: string; connectorKey?: string | undefined },
  req: Request,
) {
  const res = makeRes();
  const next = vi.fn();
  createRequireAuth(secrets)(req, res as unknown as Response, next);
  return { res, allowed: next.mock.calls.length === 1 };
}

describe("safeEqual", () => {
  it("is true only for identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("does not throw for different lengths or empty input", () => {
    expect(safeEqual("short", "a-much-longer-secret")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("bearer header", () => {
  const secrets = { authToken: TOKEN };

  it("allows the correct token", () => {
    expect(attempt(secrets, makeReq({ authorization: `Bearer ${TOKEN}` })).allowed).toBe(true);
  });

  it("accepts the scheme in any letter case", () => {
    expect(attempt(secrets, makeReq({ authorization: `bearer ${TOKEN}` })).allowed).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["wrong token", "Bearer wrong"],
    ["wrong scheme", `Basic ${TOKEN}`],
    ["scheme with no token", "Bearer "],
    ["token only", TOKEN],
  ])("rejects %s with 401", (_name, authorization) => {
    const { res, allowed } = attempt(
      secrets,
      makeReq(authorization === undefined ? {} : { authorization }),
    );
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });
});

describe("connector key in the URL", () => {
  const secrets = { authToken: TOKEN, connectorKey: KEY };

  it("allows the correct key", () => {
    expect(attempt(secrets, makeReq({ query: { key: KEY } })).allowed).toBe(true);
  });

  it("still allows the header token when a key is configured", () => {
    expect(attempt(secrets, makeReq({ authorization: `Bearer ${TOKEN}` })).allowed).toBe(true);
  });

  it.each([
    ["wrong key", { key: "nope" }],
    ["missing key", {}],
    ["empty key", { key: "" }],
    ["repeated key (array)", { key: [KEY, KEY] }],
    ["key as object", { key: { a: KEY } }],
    ["the header token used as a key", { key: TOKEN }],
    ["a different parameter name", { token: KEY }],
  ])("rejects %s with 401", (_name, query) => {
    const { res, allowed } = attempt(secrets, makeReq({ query }));
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("does not echo any secret in the error body", () => {
    const { res } = attempt(secrets, makeReq({ query: { key: "nope" } }));
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });
});

describe("connector key disabled", () => {
  it.each([
    ["undefined", undefined],
    ["empty string", ""],
  ])("ignores ?key= when the key is %s", (_name, connectorKey) => {
    expect(attempt({ authToken: TOKEN, connectorKey }, makeReq({ query: { key: "" } })).allowed).toBe(false);
    expect(attempt({ authToken: TOKEN, connectorKey }, makeReq({ query: { key: "anything" } })).allowed).toBe(false);
  });
});