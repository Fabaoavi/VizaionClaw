# 🦞 Gravity Claw

Lean, secure, fully-understood personal AI agent running on Telegram.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example → .env and fill in your secrets
cp .env.example .env

# 3. Start the bot
npm run dev
```

## Architecture

```
Telegram (long-polling, no exposed ports)
    │
    ▼
  bot.ts  ← User ID whitelist drops unauthorized users silently
    │
    ▼
  agent.ts  ← ReAct loop: LLM → tool_use → execute → feed back → repeat
    │                          │
    ▼                          ▼
  llm.ts                   tools/
  OpenRouter API           get_current_time (+ future tools)
```

## Security

- ✅ **User ID whitelist** — only responds to allowed Telegram IDs
- ✅ **No web server** — long-polling only, no exposed ports
- ✅ **Secrets in `.env`** — never hardcoded, never logged
- ✅ **Max 10 iterations** — prevents runaway agent loops
- ✅ **No third-party skills** — MCP-only integrations (Level 4)

## Levels

| Level | Feature | Status |
|-------|---------|--------|
| 1 | Foundation (Telegram + LLM + agent loop) | ✅ |
| 2 | Memory (SQLite + FTS5) | ⏳ |
| 3 | Voice (Whisper + ElevenLabs) | ⏳ |
| 4 | Tools + MCP bridge | ⏳ |
| 5 | Heartbeat (proactive check-ins) | ⏳ |
