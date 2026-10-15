import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createRequireAuth, safeEqual } from "../src/credentials.js";

const KEY = "k".repeat(40);

function makeReq(
  opts: { authorization?: string; query?: Record<string, unknown> } = {},
): Request {
  return {
    headers:
      opts.authorization === undefined
        ? {}
        : { authorization: opts.authorization },
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

function attempt(req: Request) {
  const res = makeRes();
  const next = vi.fn();
  createRequireAuth(KEY)(req, res as unknown as Response, next);
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
  it("allows the correct key", () => {
    expect(attempt(makeReq({ authorization: `Bearer ${KEY}` })).allowed).toBe(
      true,
    );
  });

  it("accepts the scheme in any letter case", () => {
    expect(attempt(makeReq({ authorization: `bearer ${KEY}` })).allowed).toBe(
      true,
    );
  });

  it.each([
    ["no header", undefined],
    ["wrong key", "Bearer wrong"],
    ["wrong scheme", `Basic ${KEY}`],
    ["scheme with no key", "Bearer "],
    ["key only", KEY],
  ])("rejects %s with 401", (_name, authorization) => {
    const { res, allowed } = attempt(
      makeReq(authorization === undefined ? {} : { authorization }),
    );
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });
});

describe("key in the URL", () => {
  it("allows the correct key", () => {
    expect(attempt(makeReq({ query: { key: KEY } })).allowed).toBe(true);
  });

  it.each([
    ["wrong key", { key: "nope" }],
    ["missing key", {}],
    ["empty key", { key: "" }],
    ["repeated key (array)", { key: [KEY, KEY] }],
    ["key as object", { key: { a: KEY } }],
    ["a different parameter name", { token: KEY }],
  ])("rejects %s with 401", (_name, query) => {
    const { res, allowed } = attempt(makeReq({ query }));
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe("both sources together", () => {
  it("allows a correct URL key even if the bearer header is wrong", () => {
    expect(
      attempt(makeReq({ authorization: "Bearer stale", query: { key: KEY } }))
        .allowed,
    ).toBe(true);
  });

  it("allows a correct bearer header even if the URL key is wrong", () => {
    expect(
      attempt(
        makeReq({ authorization: `Bearer ${KEY}`, query: { key: "stale" } }),
      ).allowed,
    ).toBe(true);
  });

  it("rejects when both are wrong", () => {
    expect(
      attempt(makeReq({ authorization: "Bearer a", query: { key: "b" } }))
        .allowed,
    ).toBe(false);
  });

  it("does not echo the secret in the error body", () => {
    const { res } = attempt(makeReq({ query: { key: "nope" } }));
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });
});
