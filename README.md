#  T-shirt E-Commerce MCP Server

A read-only MCP server that exposes a t-shirt catalog over the Model Context Protocol. Browse, search, and filter products by category, price, size, or color — from any MCP client.

Built with Node.js, the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), and Express.

## Quick Start

```bash
npm install
npm start              # stdio (local)
npm run start:http     # HTTP  (hosted, default port 3000)
npm test               # run the test suite
```

Set `PORT` to change the listening port:

```bash
PORT=8080 npm run start:http
```

## Connect to an MCP Client

**Local (stdio)** — for Claude Code, Cursor, etc.:

```json
{
  "mcpServers": {
    "ecommerce": {
      "command": "node",
      "args": ["/absolute/path/to/server.js"]
    }
  }
}
```

**Remote (HTTP):**

```json
{
  "mcpServers": {
    "ecommerce": {
      "type": "streamable-http",
      "url": "https://your-host.com/mcp"
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `get_store_info` | Store name, currency, and product categories |
| `list_products` | Browse t-shirts with filters: category, price range, size, color, in-stock |
| `get_product` | Full details for a single t-shirt by ID |
| `search_products` | Keyword search across names and descriptions |
| `get_price_range` | Cheapest, most expensive, and average price |

## Resources

| URI | Content |
|---|---|
| `store://catalog` | Full product catalog as JSON |
| `store://categories` | List of product categories |

## Prompts

| Prompt | Description |
|---|---|
| `recommend` | Get t-shirt recommendations for a given use case (e.g. "gym", "streetwear") |

## Authentication

Set the `MCP_API_KEY` environment variable to enable API key auth on the HTTP transport. Clients must send the key in the `x-api-key` header. When the variable is unset, the server runs open.

```bash
MCP_API_KEY=my-secret-key npm run start:http
```

## Customize

Edit `products.js` to change the catalog. The server reads the data on each request, so restart after editing.

## Deploy

Works on any Node.js host (Railway, Render, Fly.io, a VPS). Set the start command to `node server.js --http` and configure `PORT` and `MCP_API_KEY` as environment variables.

## Design Notes

This section explains the decisions behind the server useful if you're building your own MCP server or evaluating this one.

### Why these tools?

The five tools map to the questions a shopping assistant actually asks: "what do you carry?" (`get_store_info`), "show me options" (`list_products`), "tell me more about this one" (`get_product`), "do you have anything like X?" (`search_products`), and "what's the price range?" (`get_price_range`). Each tool does one thing and returns plain text, so the LLM can compose them naturally — asking for the store info first, then filtering, then drilling into a specific product.

The `recommend` prompt is a template, not a tool. It assembles the in-stock catalog into a prompt the client sends to the LLM, keeping the recommendation logic on the model side where it belongs.

### Why read-only?

An MCP server runs inside the trust boundary of the AI model, the model decides when to call tools and with what arguments. Read-only tools are safe by default: the worst case is the model reads data it was going to see anyway. Write operations (placing orders, updating inventory, processing payments) carry real consequences and should not be triggered by an LLM without explicit human confirmation.

### Adding write actions safely

If you extend this server with write tools (e.g. `add_to_cart`, `place_order`, `update_stock`), follow these principles:

1. **Require human confirmation.** MCP supports tool annotations mark write tools with `destructiveHint: true` so clients can prompt the user before executing. Never let the model autonomously place an order.

2. **Authenticate the user, not just the client.** The `x-api-key` header authenticates the MCP client (which AI agent is calling). Write actions also need to know *which user* is acting. Pass a user token (JWT, session cookie) as a tool argument or a second header, and validate it server-side.

3. **Validate inputs server-side.** Zod schemas on tool parameters give you structural validation for free, but business rules (is the item in stock? is the quantity reasonable? does this user have permission?) must be checked in the tool handler, not trusted from the client.

4. **Make writes idempotent.** LLMs retry. Network errors retry. If `place_order` is called twice with the same intent, it should not create two orders. Use idempotency keys.

5. **Log everything.** Every tool call in HTTP mode gets a request log the tool name, arguments, user identity, and timestamp. This gives you an audit trail for any action the AI took.

### Architecture

```
MCP Client (Claude, Cursor, etc.)
  │
  ├── stdio ───── server.js ───── products.js
  │                                (in-memory catalog)
  └── HTTP POST /mcp
        │
        ├── x-api-key middleware (optional)
        └── StreamableHTTPServerTransport
              └── stateless: one McpServer per request
```

The HTTP transport is stateless — each POST creates a fresh `McpServer` and `StreamableHTTPServerTransport`, processes the request, then tears down. This makes the server trivially horizontally scalable and avoids session affinity.

## License

MIT
