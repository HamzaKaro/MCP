import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import { store } from "./portfolio-data.js";

function createServer() {
  const server = new McpServer({
    name: "ecommerce-tshirts",
    version: "1.0.0",
  });

  // --- Resources ---

  server.resource("catalog", "store://catalog", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(store.products, null, 2),
      },
    ],
  }));

  server.resource("categories", "store://categories", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(store.categories, null, 2),
      },
    ],
  }));

  // --- Tools ---

  server.tool("get_store_info", "Get store name, currency, and available categories", async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { name: store.name, currency: store.currency, categories: store.categories },
          null,
          2
        ),
      },
    ],
  }));

  server.tool(
    "list_products",
    "List t-shirts with optional filters for category, max price, size, in-stock only, or color",
    {
      category: z.string().optional().describe("Filter by category (e.g. 'Basics', 'Graphic', 'Premium')"),
      max_price: z.number().optional().describe("Maximum price in USD"),
      min_price: z.number().optional().describe("Minimum price in USD"),
      size: z.string().optional().describe("Filter by available size (e.g. 'M', 'XL')"),
      color: z.string().optional().describe("Filter by color (partial match, e.g. 'Black')"),
      in_stock: z.boolean().optional().describe("Only show in-stock items (default: false)"),
    },
    async ({ category, max_price, min_price, size, color, in_stock }) => {
      let results = store.products;

      if (category) results = results.filter((p) => p.category.toLowerCase() === category.toLowerCase());
      if (max_price != null) results = results.filter((p) => p.price <= max_price);
      if (min_price != null) results = results.filter((p) => p.price >= min_price);
      if (size) results = results.filter((p) => p.sizes.some((s) => s.toLowerCase() === size.toLowerCase()));
      if (color) results = results.filter((p) => p.colors.some((c) => c.toLowerCase().includes(color.toLowerCase())));
      if (in_stock) results = results.filter((p) => p.inStock);

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No t-shirts match the given filters." }] };
      }

      const text = results
        .map(
          (p) =>
            `[${p.id}] ${p.name} — $${p.price.toFixed(2)} (${p.category})${p.inStock ? "" : " [OUT OF STOCK]"}\n  Colors: ${p.colors.join(", ")} | Sizes: ${p.sizes.join(", ")}`
        )
        .join("\n\n");

      return { content: [{ type: "text", text: `${results.length} result(s):\n\n${text}` }] };
    }
  );

  server.tool(
    "get_product",
    "Get full details of a t-shirt by its product ID",
    { id: z.string().describe("Product ID (e.g. 't001')") },
    async ({ id }) => {
      const product = store.products.find((p) => p.id === id);
      if (!product) {
        return { content: [{ type: "text", text: `Product "${id}" not found.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(product, null, 2) }] };
    }
  );

  server.tool(
    "search_products",
    "Search t-shirts by keyword in name or description",
    { query: z.string().describe("Search keyword (e.g. 'cotton', 'oversized', 'graphic')") },
    async ({ query }) => {
      const q = query.toLowerCase();
      const results = store.products.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No t-shirts found matching "${query}".` }] };
      }

      const text = results
        .map((p) => `[${p.id}] ${p.name} — $${p.price.toFixed(2)}\n  ${p.description}`)
        .join("\n\n");

      return { content: [{ type: "text", text: `${results.length} result(s):\n\n${text}` }] };
    }
  );

  server.tool("get_price_range", "Get the cheapest and most expensive t-shirt in the store", async () => {
    const sorted = [...store.products].sort((a, b) => a.price - b.price);
    const cheapest = sorted[0];
    const priciest = sorted[sorted.length - 1];
    return {
      content: [
        {
          type: "text",
          text: `Cheapest: ${cheapest.name} — $${cheapest.price.toFixed(2)}\nMost expensive: ${priciest.name} — $${priciest.price.toFixed(2)}\nAverage: $${(store.products.reduce((s, p) => s + p.price, 0) / store.products.length).toFixed(2)}`,
        },
      ],
    };
  });

  // --- Prompts ---

  server.prompt(
    "recommend",
    "Get t-shirt recommendations for a use case",
    [{ name: "occasion", description: "The use case (e.g. 'gym', 'streetwear', 'everyday basics')", required: true }],
    async ({ occasion }) => {
      const catalog = store.products
        .filter((p) => p.inStock)
        .map((p) => `${p.name} ($${p.price.toFixed(2)}, ${p.category}) — ${p.description}`)
        .join("\n");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `A customer is looking for a t-shirt for: ${occasion}\n\nHere is our current in-stock catalog:\n${catalog}\n\nRecommend 1-3 t-shirts with a brief reason for each.`,
            },
          },
        ],
      };
    }
  );

  return server;
}

async function startHttpServer() {
  const PORT = parseInt(process.env.PORT || "3000", 10);

  const app = createMcpExpressApp({ host: "0.0.0.0" });

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      })
    );
  });

  app.delete("/mcp", (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      })
    );
  });

  app.listen(PORT, "0.0.0.0", (error) => {
    if (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
    console.log(`Ecommerce MCP server (HTTP) listening on http://0.0.0.0:${PORT}/mcp`);
  });
}

async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ecommerce MCP server running on stdio");
}

const mode = process.argv[2];
if (mode === "--http") {
  startHttpServer();
} else {
  startStdioServer();
}
