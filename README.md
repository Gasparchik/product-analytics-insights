# Product Analytics Insights

An AI-powered analytics tool that turns a raw product event CSV into an interactive dashboard, AI-generated insights, and an agent that answers follow-up questions — all in under a minute.

Built with **Claude** (Anthropic), **FastAPI**, and **React + TypeScript**.

![Dashboard hero — charts, KPIs, and AI insights panel](docs/screenshots/dashboard_1.png)

---

## Live demo

**[Live demo →](https://your-deploy-url-here)** *(link coming soon)*

The demo uses pre-computed AI results so it's free to explore with no API key required. Clone the repo and add your Anthropic API key to run live analysis on your own data.

---

## Why I built this

Product managers routinely wait days for ad-hoc analytics — queueing for the data team or wrestling with BI tools that weren't built for exploration. I wanted to see how far one focused tool could go: deterministic metrics computed on pandas, plus an LLM that turns the numbers into a short list of "here's what's interesting, here's what to do about it."

---

## What it does

1. **Upload event data** — drop a CSV / XLS-like file, or load the built-in 50K-event SaaS demo dataset
2. **Map columns** — auto-detection of `user_id` / `timestamp` / `event_name`; any extra columns become segmentation dimensions
3. **Analyze** — four metric analyzers (engagement, retention, funnel, segments) run in parallel on pandas
4. **AI insights** — Claude generates 3–5 severity-ranked findings via structured tool use, rendered as proper UI cards
5. **Ask follow-ups** — an agentic Q&A loop picks analysis tools, runs them on the real DataFrame, and answers with exact numbers
6. **Compare & export** — switch time windows (7 / 14 / 30 / 90 d or custom), compare to previous period, export the dashboard as PNG

---

## Highlights

- **Agentic Q&A** — natural-language follow-ups handled by a Claude agent that calls analysis tools in a loop and grounds every answer in real data (no hallucinated numbers)
- **Structured AI insights via tool use** — Claude returns insights as a typed JSON schema (severity, category, tags, metric callout), so the UI renders them as proper cards instead of free-form text
- **Non-blocking analysis pipeline** — four analyzers run in parallel on a thread pool; AI insights and the 7 / 14 / 30 / 90 d windows precompute in the background so window switching is instant
- **Zero-config column mapping** — heuristic auto-detection of `user_id` / `timestamp` / `event_name`; any extra column becomes a segmentation dimension automatically
- **Built end-to-end** — React 18 + TypeScript + Tailwind v4 frontend, FastAPI + Pandas backend, Docker for one-command setup

---

## Demo

**Upload event data** — drop a CSV with a live row preview, or open the built-in SaaS demo:

![Upload screen](docs/screenshots/upload.png)

**Map columns** — required fields are auto-detected with a live preview of the mapped rows on the right; extras become segment dimensions:

![Column mapping](docs/screenshots/mapping.png)

**Engagement dashboard** — DAU / WAU / MAU and stickiness KPIs, active users over time with annotations, new vs returning split — with time-window presets and an AI insights sidebar:

![Engagement dashboard](docs/screenshots/dashboard_1.png)

**Retention** — top events with per-event drill-down, D1 / D3 / D7 / D14 / D30 curves, and a weekly cohort heatmap:

![Retention dashboard](docs/screenshots/dashboard_2.png)

**Funnel & segments** — drag-and-drop funnel builder with live per-step conversion + biggest-drop callouts; segment donuts with per-segment D7 retention:

![Funnel and segments](docs/screenshots/funnel_and_segments.png)

**AI insights** — 3–5 severity-ranked cards with typed categories, metric callouts, and tags — generated via Claude's structured tool use:

![AI insights panel](docs/screenshots/insights.png)

**Agentic Q&A** — ask in plain English; the agent picks 1–6 analysis tools, runs them, and answers with exact numbers — every tool call visible in the accordion:

![Q&A page with agent answer](docs/screenshots/qa.png)

---

## Tech stack

| Layer | Technology |
|---|---|
| AI | Claude Sonnet via [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-python) (structured tool use + agentic loop) |
| Backend | Python 3.11 · FastAPI · Pandas · asyncio |
| Frontend | React 18 · TypeScript · Vite 5 · Tailwind CSS v4 · Zustand · Recharts · react-markdown |
| Storage | JSON file storage (`backend/data/`) |
| Deploy | Docker + docker-compose |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) **or** Python 3.11+ and Node 18+
- An [Anthropic API key](https://console.anthropic.com/)

---

## Quick start (Docker)

```bash
# 1. Clone the repo
git clone https://github.com/Gasparchik/product-analytics-insights.git
cd product-analytics-insights
```

```bash
# 2. Create .env from the example
# Mac / Linux / Git Bash:
cp .env.example .env
# Windows PowerShell:
# Copy-Item .env.example .env
```

Open `.env` and set `ANTHROPIC_API_KEY=sk-ant-...`

```bash
# 3. Build and run
docker compose up --build
```

Open **http://localhost:5173** in your browser and click **Try demo**.

---

## Manual setup (without Docker)

### Backend

```bash
# From the project root — create a virtual environment
# Mac / Linux:
python3 -m venv .venv && source .venv/bin/activate
# Windows PowerShell:
# python -m venv .venv; .venv\Scripts\Activate.ps1

# Install dependencies
pip install -r backend/requirements.txt
```

Create a `.env` file at the **project root**:

```bash
# Mac / Linux / Git Bash:
cp .env.example .env
# Windows PowerShell:
# Copy-Item .env.example .env
```

Then open `.env` and set `ANTHROPIC_API_KEY=sk-ant-...`

```bash
# Start the server (from the project root)
python -m uvicorn backend.main:app --reload --port 8000
```

Verify it's running: [http://localhost:8000/api/health](http://localhost:8000/api/health) should return `{"status":"ok"}`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and click **Try demo**.

> The Vite dev server proxies `/api/*` to `http://localhost:8000` automatically.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** | — | Without it, charts still work but AI insights and Q&A are skipped |
| `DEMO_MODE` | no | `false` | Set to `true` for public deployments — AI is served from the pre-computed snapshot for the demo dataset; AI features are disabled for custom uploads |
| `ALLOWED_ORIGINS` | no | `http://localhost:5173,http://localhost:3000` | Comma-separated CORS origins |
| `ENVIRONMENT` | no | `development` | `development` or `production` |

---

## CSV format

Any CSV with at least three columns works — the mapping screen auto-detects roles:

| Role | Example column names auto-detected |
|---|---|
| User identifier | `user_id`, `userId`, `uid` |
| Timestamp | `timestamp`, `created_at`, `event_time` |
| Event name | `event_name`, `event`, `action` |

Extra columns (platform, country, plan, etc.) become segmentation dimensions automatically.

---

## Architecture notes

**Non-blocking analysis pipeline.** Four analyzers run in parallel on a `ThreadPoolExecutor` and the API returns in 1–3 seconds for typical datasets. AI insight generation and pre-computation of the 7 / 14 / 30 / 90-day time windows happen in `asyncio.create_task` so they don't block the response. A toast notification surfaces when background insights are ready.

**Structured insight output.** Insights are produced by forcing Claude to call a single `submit_insights` tool with a strict JSON schema (enum-constrained type / severity / category, optional metric callout). The frontend renders them as proper cards without fragile parsing.

**Agentic Q&A loop.** The Q&A agent runs in a FastAPI `BackgroundTasks` task and loops up to 6 turns. Each turn the agent picks tools from a registry (retention lookup, funnel recompute, segment filter, etc.), the backend executes them on the in-memory DataFrame, and tool results flow back to Claude until it produces a final markdown answer. Every tool call (name, inputs, output preview, duration) is stored alongside the answer for full transparency.

**Caching.** Analysis results are stored as JSON on disk keyed by `source_id + date range`. Subsequent requests for the same window return immediately; stale empty-insight caches self-heal by triggering background regeneration on `GET`.

**Demo snapshot.** The public demo never calls Claude at runtime. AI insights and 6 pre-computed Q&A answers are generated once locally via `python -m backend.demo.generate_snapshot` and committed to `backend/demo/snapshot.json`. The backend serves the snapshot when `is_demo=true`; the frontend is unaware of the difference.

---

## Project structure

```
product-analytics-insights/
├── backend/
│   ├── api/                 # FastAPI routes: sources, analysis, questions
│   ├── analyzers/           # Pandas-based metric computation
│   ├── ai/                  # Claude client, insights generator, Q&A tools
│   ├── demo/                # Demo dataset generator
│   ├── models/              # Pydantic models
│   ├── storage/             # JSON file storage layer
│   ├── main.py              # FastAPI entry point
│   ├── config.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # Upload, Mapping, Dashboard, Question + Layout
│   │   ├── store/           # Zustand stores (analysisStore, sourceStore)
│   │   ├── api/             # Typed API client
│   │   ├── ui/              # Reusable UI primitives (charts, cards, forms)
│   │   └── pages/           # Route-level pages
│   └── Dockerfile
├── docs/screenshots/        # README screenshots
├── docker-compose.yml
├── .env.example
└── LICENSE
```

---

## License

MIT — see [LICENSE](LICENSE).

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

Built by **Gaspar Nikogosyan** · [LinkedIn](https://www.linkedin.com/in/gaspar-nikogosyan/) · [gasparnikogosyan@gmail.com](mailto:gasparnikogosyan@gmail.com)
