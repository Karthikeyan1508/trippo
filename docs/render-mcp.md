# Render deployment and MCP

Trippo includes `render.yaml` and all deployment placeholders in `.env.example`.

The Render MCP server belongs to Codex, not the web application. Add the official hosted server to your personal Codex MCP configuration and keep the API key in an environment variable rather than committing it:

```toml
[mcp_servers.render]
url = "https://mcp.render.com/mcp"
bearer_token_env_var = "RENDER_API_KEY"
```

Create a Render API key, add it to your local environment as `RENDER_API_KEY`, then restart Codex and select your Render workspace. The web app itself never reads or exposes that key.
