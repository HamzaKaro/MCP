# Tee House — E-Commerce MCP Server

A simple MCP server that exposes a t-shirt catalog with prices, sizes, colors, and filters. Built with Node.js and the official MCP SDK.

## Quick Start

```bash
npm install
```

**Local (stdio):**
```bash
npm start
```

**Hosted (HTTP):**
```bash
npm run start:http        # default port 3000
PORT=8080 npm run start:http  # custom port
```

## Connect to Claude Code

**Local (stdio):**
```json
{
  "mcpServers": {
    "ecommerce": {
      "command": "node",
      "args": ["/path/to/server.js"]
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
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Available Tools

| Tool | Description |
|---|---|
| `get_store_info` | Store name, currency, categories |
| `list_products` | Browse t-shirts with filters: category, price range, size, color, in-stock |
| `get_product` | Full details for a single t-shirt by ID |
| `search_products` | Keyword search across names and descriptions |
| `get_price_range` | Cheapest, most expensive, and average price |

## Prompt

| Prompt | Description |
|---|---|
| `recommend` | Get t-shirt recommendations for a use case |

## Customize

Edit `portfolio-data.js` to add, remove, or update products. The server picks up changes on restart.

## Deploy

Works on any Node.js host. Set the start command to `node server.js --http` and configure `PORT` if needed.
