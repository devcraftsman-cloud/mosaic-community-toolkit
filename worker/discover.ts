import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Load .env manually without extra dependencies
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join("=").trim();
    }
  }
}

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MAX_CREDITS_THIS_RUN = 5;

if (!FIRECRAWL_KEY || FIRECRAWL_KEY.startsWith("your_")) {
  console.error("Missing FIRECRAWL_API_KEY in .env");
  process.exit(1);
}
if (!GEMINI_KEY || GEMINI_KEY.startsWith("your_")) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

const ledgerPath = path.resolve("instances/cnmid/credit-ledger.json");
const sourcesPath = path.resolve("instances/cnmid/sources.json");
const pendingDir = path.resolve("instances/cnmid/data/pending");
const publishedDir = path.resolve("instances/cnmid/data/published");

const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
if (ledger.guardrails.emergencyStop) {
  console.error("🛑 Emergency stop is active in credit-ledger.json");
  process.exit(1);
}

const existingUrls = new Set(
  [...fs.readdirSync(publishedDir), ...fs.readdirSync(pendingDir)]
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const dir = fs.existsSync(path.join(publishedDir, f)) ? publishedDir : pendingDir;
      return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).canonicalUrl;
    })
);

const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const targets = sources.targets
  .filter((t) => t.enabled)
  .sort((a, b) => (a.lastScrapedAt || "").localeCompare(b.lastScrapedAt || ""))
  .slice(0, MAX_CREDITS_THIS_RUN);

let creditsSpent = 0;

for (const target of targets) {
  if (creditsSpent >= MAX_CREDITS_THIS_RUN) break;
  console.log(`🔍 Scraping [${target.sourceId}]: ${target.url}`);

  const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIRECRAWL_KEY}`
    },
    body: JSON.stringify({
      url: target.url,
      formats: ["markdown"],
      onlyMainContent: true
    })
  });

  creditsSpent++;
  target.lastScrapedAt = new Date().toISOString();
  target.lastScrapedAt = new Date().toISOString();
  if (!fcRes.ok) {
    console.warn(`⚠️ Firecrawl error on ${target.sourceId}: ${fcRes.status}`);
    continue;
  }

  const fcData = await fcRes.json();
  const markdown = (fcData.data?.markdown || "").slice(0, 14000);
  if (!markdown) continue;

  const prompt = `Extract up to 3 distinct, real, upcoming or evergreen tech resources/events from this page for the Cloud Native Midwest (CNMid) community board.
Category must be "${target.category}". Base tags: ${JSON.stringify(target.tags)}.
Never include private street addresses if an event is RSVP-only.
Return ONLY a JSON array of objects with keys: title (max 120 chars), summary (15-260 chars), canonicalUrl (valid full http/https URL), publisherName, city (optional), state (optional), startsAt (optional ISO-8601 string), tags (lowercase kebab-case array).
Markdown content:
${markdown}`;

  let gemRes;
  for (const model of ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
    gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    );
    if (gemRes.status !== 503) break;
    console.log(`⏳ ${model} busy (503), falling back...`);
  }

  if (!gemRes.ok) {
    console.warn(`⚠️ Gemini error on ${target.sourceId}: ${gemRes.status}`, await gemRes.text());
    continue;
  }

  const gemData = await gemRes.json();
  const rawText = gemData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  let extracted = [];
  try {
    extracted = JSON.parse(rawText);
  } catch {
    continue;
  }

  const now = new Date().toISOString();
  for (const item of extracted) {
    if (!item.canonicalUrl || existingUrls.has(item.canonicalUrl)) continue;
    existingUrls.add(item.canonicalUrl);

    const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const id = `cnmid-${slug}-${crypto.randomBytes(3).toString("hex")}`;

    const corkboardItem = {
      id,
      instanceId: "cnmid",
      communityIds: ["cnmid"],
      category: target.category,
      title: item.title.slice(0, 140),
      summary: item.summary.slice(0, 280),
      canonicalUrl: item.canonicalUrl,
      alternateUrls: [],
      ...(item.city ? { location: { mode: "in-person", city: item.city, state: item.state || "WI" } } : {}),
      sourceId: target.sourceId,
      sourceType: "firecrawl-discovered",
      attribution: { publisherName: item.publisherName || target.sourceId },
      participation: { mode: target.category === "learning-library" ? "async-contribution" : "rsvp-requested" },
      dates: {
        ...(item.startsAt ? { startsAt: item.startsAt } : {}),
        discoveredAt: now,
        lastVerifiedAt: now
      },
      status: "pending-review",
      isSponsored: false,
      tags: Array.from(new Set([...target.tags, ...(item.tags || [])])).map((t) =>
        t.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
      ),
      provenanceLog: [
        { timestamp: now, actor: "firecrawl-gemini-worker", action: "discovered-pending-review", note: `Scraped from ${target.url}` }
      ]
    };

    const outPath = path.join(pendingDir, `${id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(corkboardItem, null, 2) + "\n");
    console.log(`📌 Queued for review: ${corkboardItem.title}`);
  }
}

fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
ledger.usage.creditsConsumedTotal += creditsSpent;
ledger.usage.creditsConsumedCurrentWeek += creditsSpent;
ledger.usage.runs.push({ timestamp: new Date().toISOString(), creditsSpent, targetsChecked: targets.length });
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
console.log(`✅ Discovery complete. Credits used: ${creditsSpent}/${MAX_CREDITS_THIS_RUN}`);
