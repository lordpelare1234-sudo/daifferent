/**
 * PJ Archive AI — Smart Drive Loader v4
 * ======================================
 * - Parallel batch loading (10 at a time) with per-file 15s timeout
 * - Index built once in memory, instant on repeat calls
 * - Fuzzy person name matching (handles typos)
 * - Category + keyword scoring for top-3 doc retrieval
 * - Max 8,000 chars context sent to AI
 * - Individual name part scoring for peripheral figures
 */

const { google } = require("googleapis");


// ─────────────────────────────────────────────────────────────
// DOCUMENT INDEX
// ─────────────────────────────────────────────────────────────

let _index    = [];
let _indexAt  = null;
let _building = false;
let _buildPromise = null;
const INDEX_TTL   = 1000 * 60 * 60 * 24; // 24 hours

function indexReady() {
  return _index.length > 0 && _indexAt && (Date.now() - _indexAt < INDEX_TTL);
}


// ─────────────────────────────────────────────────────────────
// GREETING DETECTION
// ─────────────────────────────────────────────────────────────

const GREETING_RE = /^\s*(hi+|hello+|hey+|good\s+(morning|afternoon|evening|day)|howdy|greetings|greeting|salutations|sup|yo|hiya|hola|what'?s up|wassup|morning|afternoon|evening)\s*[!?.,]?\s*$/i;

function isGreeting(question) {
  return GREETING_RE.test(question.trim());
}


// ─────────────────────────────────────────────────────────────
// CATEGORY DETECTION
// ─────────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { name: "timeline",       patterns: [/\b(when|what time|chronolog|timeline|sequence|order of events|before|after|during|at \d{1,2}[:.]\d{2}|on the night|that evening|that morning)\b/i], hints: ["timeline","chronology","sequence","events"] },
  { name: "witness",        patterns: [/\b(witness|statement|sighting|testimony|saw|seen|reported|claimed|account|observer)\b/i],                                                            hints: ["witness","statement","sighting","testimony","account"] },
  { name: "forensics",      patterns: [/\b(dna|blood|cadaver|eddie|keela|forensic|luminol|swab|sample|lab|biological|trace|fibre|fiber|hair|reagent|evrd|csi dog)\b/i],                     hints: ["forensic","dna","blood","dog","eddie","keela","lab","trace"] },
  { name: "phone",          patterns: [/\b(phone|mobile|cell|sms|text message|call log|ping|tower|telecom|communications|contact|rang|called)\b/i],                                         hints: ["phone","mobile","telecom","call","sms","communications"] },
  { name: "maps",           patterns: [/\b(apartment|flat|route|location|distance|map|layout|floor plan|praia da luz|ocean club|resort|access|entrance|exit|nearby)\b/i],                   hints: ["map","location","apartment","layout","route","floor"] },
  { name: "rogatory",       patterns: [/\b(rogatory|uk interview|leicestershire|formal interview|2008 interview)\b/i],                                                                       hints: ["rogatory"] },
  { name: "transcript",     patterns: [/\b(transcript|interview|interrogat|deposition|questioned|answered|replied|admitted|denied)\b/i],                                                     hints: ["transcript","interview","interrogat"] },
  { name: "correspondence", patterns: [/\b(letter|email|correspondence|wrote|written|official communication|memo|fax)\b/i],                                                                  hints: ["letter","correspondence","email","memo"] },
  { name: "police",         patterns: [/\b(police|pj|gnr|operation grange|met police|investigation|search operation|arguido|suspect|arrest|report)\b/i],                                     hints: ["police","pj","gnr","grange","investigation","report"] },
  { name: "theories",       patterns: [/\b(theory|theor|hypothesis|believe|think|speculate|scenario|possibility|responsible|culprit|who (did|took|killed|abducted))\b/i],                    hints: ["theor","hypothesis","scenario"] },
];

function detectCategory(question) {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some(p => p.test(question))) return rule.name;
  }
  return null;
}

function getCategoryHints(category) {
  if (!category) return [];
  const rule = CATEGORY_RULES.find(r => r.name === category);
  return rule ? rule.hints : [];
}


// ─────────────────────────────────────────────────────────────
// PERSON EXTRACTION  (exact + fuzzy)
// ─────────────────────────────────────────────────────────────

const KNOWN_PERSONS = [

  // ── McCann Family ──────────────────────────────────────────
  "madeleine mccann",
  "kate mccann", "kate healy",
  "gerry mccann",
  "amelie mccann",
  "sean mccann",
  "brian healy",
  "susan healy",
  "john mccann",
  "philomena mccann",

  // ── Tapas 9 ───────────────────────────────────────────────
  "jane tanner",
  "russell o'brien",
  "rachael oldfield", "rachel oldfield",
  "matthew oldfield",
  "david payne",
  "fiona payne",
  "dianne webster", "diane webster",

  // ── Peripheral holiday contacts ────────────────────────────
  "charlotte gorrod",
  "jim gorrod",
  "jeremy wilkins", "jez wilkins",
  "yvonne martin",
  "sandy cameron",

  // ── Smith Family ──────────────────────────────────────────
  "martin smith",
  "peter smith",
  "mary smith",
  "aoife smith",

  // ── Robert Murat & associates ──────────────────────────────
  "robert murat",
  "jennie murat",
  "michaela walczuch",
  "luis antonio",
  "sergey malinka",

  // ── Christian Brueckner & associates ──────────────────────
  "christian brueckner",
  "helge busching",
  "hazel behan",
  "friedrich fuelscher", "friedrich fülscher",

  // ── Portuguese Police / PJ ─────────────────────────────────
  "gonçalo amaral", "goncalo amaral",
  "paulo rebelo",
  "ricardo paiva",
  "joao carlos",
  "luis neves",

  // ── Operation Grange / Met Police ─────────────────────────
  "andy redwood",
  "nicola wall",
  "hamish campbell",
  "jim gamble",

  // ── German Prosecutors ────────────────────────────────────
  "hans christian wolters",

  // ── McCann representatives / legal ────────────────────────
  "clarence mitchell",
  "rogerio alves",
  "michael caplan",
  "justine mcguinness",
  "brian kennedy",
  "edward smethurst",

  // ── Private investigators ─────────────────────────────────
  "kevin halligen",
  "henri exton",
  "dave edgar",
  "arthur cowley",

  // ── Key witnesses ─────────────────────────────────────────
  "derek flack",
  "john hill",
  "antonio castela",
  "luis garcia",
  "silvia batista",
  "amy tierney",
  "catriona baker",
  "stephen carpenter",

  // ── Media / authors ──────────────────────────────────────
  "paulo sargento",
  "sandra felgueiras",
  "duarte levy",
  "francisco moita flores",

];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function extractPersonName(question) {
  const lower = question.toLowerCase();

  // 1. Exact match
  for (const p of KNOWN_PERSONS) {
    if (lower.includes(p)) return p;
  }

  // 2. Fuzzy match on word pairs
  const words = lower.replace(/[^a-z\s']/g, "").split(/\s+/).filter(w => w.length > 1);
  let bestPerson = null, bestDist = Infinity;

  for (let i = 0; i < words.length - 1; i++) {
    const pair = words[i] + " " + words[i + 1];
    for (const p of KNOWN_PERSONS) {
      const pShort = p.split(" ").slice(0, 2).join(" ");
      const dist   = levenshtein(pair, pShort);
      const maxLen = Math.max(pair.length, pShort.length);
      if (dist < bestDist && dist <= Math.max(2, Math.floor(maxLen * 0.25))) {
        bestDist = dist; bestPerson = p;
      }
    }
  }

  if (bestPerson) {
    console.log(`[Person] Fuzzy: "${lower}" → "${bestPerson}" (dist=${bestDist})`);
    return bestPerson;
  }

  // 3. Title Case fallback
  const m = question.match(/\b([A-Z][a-z]{1,})\s([A-Z][a-z]{1,})\b/);
  return m ? m[0].toLowerCase() : null;
}

function isPersonQuery(question) {
  return /\b(who is|who was|tell me about|what did .+ say|what do you know about|information on|profile of|role of|involvement of)\b/i.test(question)
    || extractPersonName(question) !== null;
}


// ─────────────────────────────────────────────────────────────
// GOOGLE DRIVE CLIENT
// ─────────────────────────────────────────────────────────────

async function getDriveClient() {
  const email  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");

  const privateKey = rawKey.replace(/\\n/g, "\n").replace(/\\r/g, "").trim();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth: await auth.getClient() });
}


// ─────────────────────────────────────────────────────────────
// BUILD INDEX
// ─────────────────────────────────────────────────────────────

async function buildDocumentIndex() {
  if (indexReady()) return;
  if (_building && _buildPromise) { await _buildPromise; return; }

  _building     = true;
  _buildPromise = _doBuild().finally(() => { _building = false; _buildPromise = null; });
  await _buildPromise;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms)),
  ]);
}

async function _doBuild() {
  console.log("[Drive] Building index...");
  const drive = await getDriveClient();

  const fileList = await drive.files.list({
    q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 300,
  });

  const files = fileList.data.files || [];
  console.log(`[Drive] ${files.length} files found — loading in parallel batches of 10`);

  async function fetchOne(file) {
    try {
      let content = "";
      if (file.mimeType === "application/vnd.google-apps.document") {
        const res = await withTimeout(
          drive.files.export({ fileId: file.id, mimeType: "text/plain" }), 15000
        );
        content = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      } else if (file.mimeType === "text/plain" || file.mimeType === "text/markdown") {
        const res = await withTimeout(
          drive.files.get({ fileId: file.id, alt: "media" }), 15000
        );
        content = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      } else {
        return null;
      }
      return {
        name:         file.name,
        nameLower:    file.name.toLowerCase(),
        content:      content.trim(),
        contentLower: content.toLowerCase(),
      };
    } catch (err) {
      console.error(`[Drive] Skipped: ${file.name} — ${err.message}`);
      return null;
    }
  }

  const BATCH = 10;
  const entries = [];

  for (let i = 0; i < files.length; i += BATCH) {
    const batch   = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(fetchOne));
    const loaded  = results.filter(Boolean);
    entries.push(...loaded);
    console.log(`[Drive] Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(files.length / BATCH)} — ${entries.length} loaded so far`);
  }

  _index   = entries;
  _indexAt = Date.now();
  console.log(`[Drive] Index ready: ${entries.length}/${files.length} documents`);
}

async function fetchAllDriveDocuments() {
  await buildDocumentIndex();
  return `[Index: ${_index.length} documents]`;
}


// ─────────────────────────────────────────────────────────────
// RETRIEVAL
// ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","what","who","when","where","how",
  "did","do","does","in","of","to","and","or","for","with","about","that",
  "this","it","he","she","they","we","i","me","my","his","her","their","our",
  "have","has","had","been","be","will","would","could","should","can","may",
  "tell","show","give","find","get","any","all","some","from","at","by","on",
  "please","explain","describe","list",
]);

const MAX_CHARS = 8000;
const MAX_DOCS  = 3;

async function retrieveRelevantContext(question) {
  await buildDocumentIndex();

  if (_index.length === 0) return { context: "", sourceNote: "Drive unavailable" };

  const category   = detectCategory(question);
  const personName = extractPersonName(question);
  const isPersonQ  = isPersonQuery(question) && personName !== null;
  const catHints   = getCategoryHints(category);

  // Extract keywords + individual name parts so e.g. "charlotte" and "gorrod" each score independently
  const rawWords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const personParts = personName
    ? personName.replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 2)
    : [];

  const keywords = [...new Set([...rawWords, ...personParts])];

  console.log(`[Retrieve] cat=${category || "general"} | person=${personName || "none"} | kw=[${keywords.slice(0,8).join(",")}]`);

  const scored = _index.map(doc => {
    let score = 0;

    // Keyword scoring
    for (const kw of keywords) {
      if (doc.nameLower.includes(kw)) score += 50;
      score += (doc.contentLower.match(new RegExp(kw, "g")) || []).length * 3;
    }

    // Person scoring — full name + individual parts
    if (isPersonQ && personName) {
      const safeName = personName.replace(/'/g, ".");
      if (doc.nameLower.includes(personName)) score += 60;
      score += (doc.contentLower.match(new RegExp(safeName, "g")) || []).length * 10;

      for (const part of personParts) {
        if (doc.nameLower.includes(part)) score += 20;
        score += (doc.contentLower.match(new RegExp(part, "g")) || []).length * 4;
      }
    }

    // Category hint scoring
    for (const hint of catHints) {
      if (doc.nameLower.includes(hint)) score += 30;
      score += (doc.contentLower.match(new RegExp(hint, "g")) || []).length;
    }

    return { doc, score };
  });

  const topDocs = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DOCS)
    .map(s => s.doc);

  if (topDocs.length === 0) {
    console.log("[Retrieve] No matching documents");
    return { context: "", sourceNote: "No matching documents" };
  }

  let combined = "";
  const names  = [];

  for (const doc of topDocs) {
    const remaining = MAX_CHARS - combined.length;
    if (remaining <= 200) break;
    const block = `\n\n=== DOCUMENT: ${doc.name} ===\n${doc.content}`;
    combined   += block.length > remaining ? block.substring(0, remaining) : block;
    names.push(doc.name);
  }

  console.log(`[Retrieve] ${names.length} docs | ${combined.length} chars (~${Math.round(combined.length / 4)} tokens)`);
  return { context: combined.trim(), sourceNote: names.join(", ") };
}


// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  isGreeting,
  retrieveRelevantContext,
  detectCategory,
  extractPersonName,
  fetchAllDriveDocuments,
  buildDocumentIndex,
};