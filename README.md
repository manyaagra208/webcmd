# AgentScout

A small, real browser-agent demo for the SLAB Browser Agents hackathon.

## What it does

1. Takes a natural-language request such as:
   "Find 5 upcoming college hackathons in India"
2. Opens a real Chromium browser with Playwright.
3. Searches the live web.
4. Extracts result links/text.
5. Uses Gemini (when `GEMINI_API_KEY` is configured) to turn the evidence into structured opportunities.
6. Re-checks the source pages and marks results as verified only when a source URL was actually visited.
7. Shows the agent's state and activity in a simple dashboard.

It does not submit forms, make payments, bypass CAPTCHAs, or bypass authentication/security controls.

## Run

```bash
npm install
npx playwright install chromium
copy .env.example .env
# add GEMINI_API_KEY if you have one
npm start
```

Open http://localhost:3000

## Without a Gemini key

The browser still performs a real search and extracts evidence. The UI will explain that AI structuring is unavailable. For the strongest hackathon demo, configure a Gemini API key.

## Webcmd

The app checks whether `webcmd` is installed and displays its version. It does not invent Webcmd APIs or commands. If you want to add a learned workflow, use the exact commands exposed by your installed `webcmd --help`/documentation.

## Demo

Try:
`Find 5 upcoming hackathons suitable for college students in India`

The agent intentionally stays small so the browser-agent loop is easy to explain.
