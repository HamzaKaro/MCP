import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const PORT = 4567;
const BASE = `http://localhost:${PORT}/mcp`;
const API_KEY = "test-secret-key";

let serverProcess;

function jsonRpc(method, params = {}, id = 1) {
  return JSON.stringify({ jsonrpc: "2.0", method, params, id });
}

async function mcpCall(method, params = {}, { apiKey = API_KEY, id = 1 } = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(BASE, {
    method: "POST",
    headers,
    body: jsonRpc(method, params, id),
  });
  return res;
}

function parseSSE(text) {
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
  return dataLine ? JSON.parse(dataLine.slice(6)) : null;
}

async function callTool(name, args = {}) {
  const res = await mcpCall("tools/call", { name, arguments: args });
  const parsed = parseSSE(await res.text());
  return parsed.result.content[0].text;
}

before(async () => {
  const { spawn } = await import("node:child_process");
  serverProcess = spawn("node", ["server.js", "--http"], {
    env: { ...process.env, PORT: String(PORT), MCP_API_KEY: API_KEY },
    stdio: "pipe",
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
});

after(() => {
  serverProcess?.kill();
});

// --- Access Control ---

describe("access control", () => {
  it("rejects requests without an API key", async () => {
    const res = await mcpCall("tools/list", {}, { apiKey: null });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, -32001);
  });

  it("rejects requests with a wrong API key", async () => {
    const res = await mcpCall("tools/list", {}, { apiKey: "wrong-key" });
    assert.equal(res.status, 401);
  });

  it("accepts requests with the correct API key", async () => {
    const res = await mcpCall("tools/list");
    assert.equal(res.status, 200);
  });
});

// --- HTTP Methods ---

describe("http methods", () => {
  it("returns 405 on GET /mcp", async () => {
    const res = await fetch(BASE, {
      headers: { "x-api-key": API_KEY },
    });
    assert.equal(res.status, 405);
  });

  it("returns 405 on DELETE /mcp", async () => {
    const res = await fetch(BASE, {
      method: "DELETE",
      headers: { "x-api-key": API_KEY },
    });
    assert.equal(res.status, 405);
  });
});

// --- Tools ---

describe("get_store_info", () => {
  it("returns store name, currency, and categories", async () => {
    const text = await callTool("get_store_info");
    const info = JSON.parse(text);
    assert.equal(info.name, "Tee House");
    assert.equal(info.currency, "USD");
    assert.ok(Array.isArray(info.categories));
    assert.ok(info.categories.length > 0);
  });
});

describe("list_products", () => {
  it("returns all products with no filters", async () => {
    const text = await callTool("list_products");
    assert.ok(text.includes("10 result(s)"));
  });

  it("filters by category", async () => {
    const text = await callTool("list_products", { category: "Athletic" });
    assert.ok(text.includes("2 result(s)"));
    assert.ok(text.includes("Dri-Fit"));
    assert.ok(text.includes("Compression"));
  });

  it("filters by max_price", async () => {
    const text = await callTool("list_products", { max_price: 25 });
    assert.ok(text.includes("Classic Crew Neck"));
    assert.ok(text.includes("Striped Pocket"));
    assert.ok(!text.includes("Pima Cotton"));
  });

  it("filters by size", async () => {
    const text = await callTool("list_products", { size: "XXL" });
    assert.ok(text.includes("Classic Crew Neck"));
    assert.ok(text.includes("Compression Base Layer"));
  });

  it("filters by color", async () => {
    const text = await callTool("list_products", { color: "Olive" });
    assert.ok(text.includes("Heavyweight Boxy"));
  });

  it("filters in-stock only", async () => {
    const text = await callTool("list_products", { in_stock: true });
    assert.ok(!text.includes("[OUT OF STOCK]"));
    assert.ok(!text.includes("Abstract Art Print"));
  });

  it("returns empty message when no matches", async () => {
    const text = await callTool("list_products", { category: "Nonexistent" });
    assert.ok(text.includes("No t-shirts match"));
  });
});

describe("get_product", () => {
  it("returns product details by ID", async () => {
    const text = await callTool("get_product", { id: "t001" });
    const product = JSON.parse(text);
    assert.equal(product.id, "t001");
    assert.equal(product.name, "Classic Crew Neck Tee");
    assert.equal(product.price, 19.99);
    assert.ok(Array.isArray(product.sizes));
    assert.ok(Array.isArray(product.colors));
  });

  it("returns not found for invalid ID", async () => {
    const text = await callTool("get_product", { id: "t999" });
    assert.ok(text.includes("not found"));
  });
});

describe("search_products", () => {
  it("finds products by name keyword", async () => {
    const text = await callTool("search_products", { query: "vintage" });
    assert.ok(text.includes("Vintage Band Tee"));
    assert.ok(text.includes("1 result(s)"));
  });

  it("finds products by description keyword", async () => {
    const text = await callTool("search_products", { query: "moisture" });
    assert.ok(text.includes("Dri-Fit"));
  });

  it("is case insensitive", async () => {
    const text = await callTool("search_products", { query: "PIMA" });
    assert.ok(text.includes("Pima Cotton"));
  });

  it("returns empty message for no matches", async () => {
    const text = await callTool("search_products", { query: "nonexistent" });
    assert.ok(text.includes("No t-shirts found"));
  });
});

describe("get_price_range", () => {
  it("returns cheapest, most expensive, and average", async () => {
    const text = await callTool("get_price_range");
    assert.ok(text.includes("Cheapest:"));
    assert.ok(text.includes("Most expensive:"));
    assert.ok(text.includes("Average:"));
    assert.ok(text.includes("$19.99"));
    assert.ok(text.includes("$54.99"));
  });
});
