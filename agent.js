import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_RESULTS = 5;

function log(state, action, detail, logs) {
  logs.push({
    time: new Date().toLocaleTimeString(),
    state,
    action,
    detail
  });
}

function webcmdVersion() {
  try {
    const cmd = process.platform === "win32" ? "webcmd.cmd" : "webcmd";
    return execFileSync(cmd, ["--version"], {
      encoding: "utf8",
      timeout: 5000
    }).trim();
  } catch {
    return null;
  }
}

export async function getEnvironment() {
  return {
    node: process.version,
    webcmd: webcmdVersion(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
  };
}

async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return null;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` +
    encodeURIComponent(process.env.GEMINI_API_KEY);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned no text.");
  }

  return JSON.parse(text);
}

function cleanDuckUrl(url) {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname.includes("duckduckgo.com") &&
      parsed.searchParams.has("uddg")
    ) {
      return parsed.searchParams.get("uddg");
    }

    return url;
  } catch {
    return url;
  }
}

function isUsefulSearchResult(title, url) {
  const t = title.toLowerCase();
  const u = url.toLowerCase();

  const badWords = [
    "earn money",
    "paid survey",
    "survey",
    "advertisement",
    "jobs",
    "job search",
    "shopping",
    "coupon"
  ];

  const relevantWords = [
    "hackathon",
    "hackathons",
    "hack ",
    "competition",
    "coding challenge",
    "innovation challenge"
  ];

  if (!title || title.length < 6) return false;
  if (!url.startsWith("http")) return false;
  if (badWords.some(word => t.includes(word))) return false;

  return (
    relevantWords.some(word => t.includes(word)) ||
    u.includes("hackathon") ||
    u.includes("hack")
  );
}

function extractBasicDetails(text, pageTitle, url) {
  const clean = text.replace(/\s+/g, " ").trim();

  const deadlineMatch = clean.match(
    /(?:deadline|registration closes?|applications? close|last date)[^.!?]{0,120}/i
  );

  const dateMatch = clean.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?/i
  );

  const india =
    /\bindia\b|\bindian\b|\bvirtual\b|\bonline\b/i.test(clean);

  return {
    title: pageTitle,
    organization: extractOrganization(clean),
    deadline: deadlineMatch?.[0] || "Check source",
    eventDate: dateMatch?.[0] || "Check source",
    location: india ? "India / Online" : "Check source",
    eligibility: /\bstudent\b|\bcollege\b|\buniversity\b/i.test(clean)
      ? "Students / college participants"
      : "Check source",
    url,
    source: url
  };
}

function extractOrganization(text) {
  const patterns = [
    /organized by\s+([^.|]{3,80})/i,
    /hosted by\s+([^.|]{3,80})/i,
    /by\s+([A-Z][A-Za-z0-9 &.-]{2,60})\s+(?:hackathon|competition)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "Check source";
}

export async function runAgent(task) {
  console.log("🔥 NEW AGENT.JS IS RUNNING 🔥");

  const logs = [];
  let browser;

  try {
    log("PLANNING", "understand_task", task, logs);

    browser = await chromium.launch({
  headless: false,
  channel: "chrome"
});
    const page = await browser.newPage({
      viewport: {
        width: 1280,
        height: 800
      }
    });

    const searchQuery =
      "upcoming hackathons India college students 2026";

    const searchUrl =
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;

    log(
      "NAVIGATING",
      "open_search",
      `Searching for: ${searchQuery}`,
      logs
    );

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20000
    });

    await page.waitForTimeout(2500);

    log(
      "SEARCHING",
      "observe_page",
      await page.title(),
      logs
    );

    const links = await page.evaluate(() => {
      const results = [];

      document.querySelectorAll(".result").forEach(result => {
        const anchor = result.querySelector(".result__a");
        const snippet = result.querySelector(".result__snippet");

        if (!anchor) return;

        results.push({
          title: (anchor.innerText || "")
            .trim()
            .replace(/\s+/g, " "),
          url: anchor.href,
          snippet: (snippet?.innerText || "")
            .trim()
            .replace(/\s+/g, " ")
        });
      });

      return results;
    });

    const usefulLinks = links
      .map(item => ({
        ...item,
        url: cleanDuckUrl(item.url)
      }))
      .filter(item => isUsefulSearchResult(item.title, item.url));

    log(
      "EXTRACTING",
      "collect_search_results",
      `${usefulLinks.length} relevant candidate links found`,
      logs
    );

    const verified = [];

    for (const item of usefulLinks) {
      if (verified.length >= MAX_RESULTS) break;

      const targetUrl = item.url;

      try {
        log(
          "VALIDATING",
          "visit_source",
          targetUrl,
          logs
        );

        const sourceContext = await browser.newContext({
          viewport: {
            width: 1280,
            height: 800
          }
        });

        const sourcePage = await sourceContext.newPage();

        await sourcePage.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 12000
        });

        await sourcePage.waitForTimeout(1200);

        const finalUrl = sourcePage.url();
        const pageTitle = await sourcePage.title();

        const bodyText = (
          await sourcePage.locator("body").innerText()
        )
          .replace(/\s+/g, " ")
          .slice(0, 12000);

        await sourcePage.close();
        await sourceContext.close();

        const combinedText =
          `${pageTitle} ${bodyText}`.toLowerCase();

        const isHackathonPage =
          combinedText.includes("hackathon") ||
          combinedText.includes("hackathon");

        const isStudentRelevant =
          /\bstudent\b|\bcollege\b|\buniversity\b/i.test(
            combinedText
          );

        const isIndiaRelevant =
          /\bindia\b|\bindian\b|\bonline\b/i.test(
            combinedText
          );

        if (!isHackathonPage) {
          log(
            "RECOVERING",
            "reject_source",
            `${finalUrl} does not appear to be a hackathon page`,
            logs
          );
          continue;
        }

        if (!isStudentRelevant && !isIndiaRelevant) {
          log(
            "RECOVERING",
            "reject_source",
            `${finalUrl} is not clearly student/India relevant`,
            logs
          );
          continue;
        }

        const details = extractBasicDetails(
          bodyText,
          pageTitle,
          finalUrl
        );

        verified.push({
          ...details,
          verified: true,
          pageTitle,
          snippet: item.snippet
        });

        log(
          "VALIDATING",
          "source_verified",
          finalUrl,
          logs
        );
      } catch (error) {
        log(
          "RECOVERING",
          "source_failed",
          `${targetUrl} | ${error.message}`,
          logs
        );
      }
    }

    /*
      Optional AI refinement.
      The project still works without Gemini.
    */

    let aiUsed = false;

    if (verified.length > 0 && process.env.GEMINI_API_KEY) {
      try {
        const prompt = `
You are refining results collected by a real browser agent.

User task:
${task}

Observed verified pages:
${JSON.stringify(verified, null, 2)}

Return ONLY valid JSON:

{
  "results": [
    {
      "title": "string",
      "organization": "string",
      "deadline": "string",
      "eventDate": "string",
      "location": "string",
      "eligibility": "string",
      "url": "string",
      "source": "string"
    }
  ]
}

Rules:
- Use only the observed URLs.
- Do not invent facts.
- Keep only relevant upcoming hackathons.
- Maximum 5 results.
`;

        const structured = await askGemini(prompt);

        if (Array.isArray(structured?.results)) {
          const allowedUrls = new Set(
            verified.map(x => x.url)
          );

          const refined = structured.results.filter(x =>
            allowedUrls.has(x.url)
          );

          if (refined.length > 0) {
            verified.splice(
              0,
              verified.length,
              ...refined.map(x => ({
                ...x,
                verified: true
              }))
            );

            aiUsed = true;

            log(
              "VALIDATING",
              "ai_refinement",
              "Gemini refined verified browser evidence",
              logs
            );
          }
        }
      } catch (error) {
        log(
          "RECOVERING",
          "ai_fallback",
          error.message,
          logs
        );
      }
    }

    log(
      "COMPLETED",
      "return_results",
      `${verified.length} verified hackathon sources`,
      logs
    );

    return {
      task,
      results: verified.slice(0, MAX_RESULTS),
      logs,
      webcmd: webcmdVersion(),
      aiUsed
    };
    } finally {
    if (browser) {
      // Keep the visible browser open for 20 seconds,
      // but DO NOT block the website response.
      setTimeout(() => {
        browser.close().catch(() => {});
      }, 20000);
    }
  }
}
