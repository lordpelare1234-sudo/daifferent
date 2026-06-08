/**
 * PJ Archive AI — Drive Loader v7
 * - Loads all docs into memory at startup
 * - Simple TF scoring on full content — no category rules, no snippet tricks
 * - Sends full content of top docs to AI
 * - Recursive subfolder support
 */

const { google } = require("googleapis");

// ─────────────────────────────────────────────────────────────
// DOCUMENT INDEX
// ─────────────────────────────────────────────────────────────

let _index        = [];
let _indexAt      = null;
let _building     = false;
let _buildPromise = null;
const INDEX_TTL   = 1000 * 60 * 60 * 24;

function indexReady() {
  return _index.length > 0 && _indexAt && (Date.now() - _indexAt < INDEX_TTL);
}

// ─────────────────────────────────────────────────────────────
// GREETING DETECTION
// ─────────────────────────────────────────────────────────────

const GREETING_RE = /^\s*(hi+|hello+|hey+|good\s+(morning|afternoon|evening|day)|howdy|greetings|sup|yo|hiya|hola|what'?s up|wassup|morning|afternoon|evening)\s*[!?.,]?\s*$/i;

function isGreeting(question) {
  return GREETING_RE.test(question.trim());
}

// ─────────────────────────────────────────────────────────────
// KNOWN PERSONS
// ─────────────────────────────────────────────────────────────

const KNOWN_PERSONS = [
  "madeleine mccann", "kate mccann", "kate healy", "gerry mccann",
  "amelie mccann", "sean mccann", "brian healy", "susan healy",
  "john mccann", "philomena mccann",
  "jane tanner", "russell o'brien", "rachael oldfield", "rachel oldfield",
  "matthew oldfield", "david payne", "fiona payne", "dianne webster", "diane webster",
  "charlotte gorrod", "jim gorrod", "jeremy wilkins", "jez wilkins",
  "yvonne martin", "sandy cameron",
  "martin smith", "peter smith", "mary smith", "aoife smith",
  "robert murat", "jennie murat", "michaela walczuch", "luis antonio", "sergey malinka",
  "christian brueckner", "helge busching", "hazel behan",
  "friedrich fuelscher", "friedrich fülscher",
  "gonçalo amaral", "goncalo amaral", "paulo rebelo", "ricardo paiva",
  "joao carlos", "luis neves",
  "andy redwood", "nicola wall", "hamish campbell", "jim gamble",
  "hans christian wolters",
  "clarence mitchell", "rogerio alves", "michael caplan",
  "justine mcguinness", "brian kennedy", "edward smethurst",
  "kevin halligen", "henri exton", "dave edgar", "arthur cowley",
  "derek flack", "john hill", "antonio castela", "luis garcia",
  "silvia batista", "amy tierney", "catriona baker", "stephen carpenter",
  "paulo sargento", "sandra felgueiras", "duarte levy", "francisco moita flores",
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
  for (const p of KNOWN_PERSONS) {
    if (lower.includes(p)) return p;
  }
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
  const m = question.match(/\b([A-Z][a-z]{1,})\s([A-Z][a-z]{1,})\b/);
  return m ? m[0].toLowerCase() : null;
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
// RECURSIVE FILE LISTER
// ─────────────────────────────────────────────────────────────

async function getAllFilesRecursive(drive, folderId) {
  const allFiles = [];
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 300,
  });
  for (const item of (res.data.files || [])) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      allFiles.push(...await getAllFilesRecursive(drive, item.id));
    } else {
      allFiles.push(item);
    }
  }
  return allFiles;
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
  const files = await getAllFilesRecursive(drive, process.env.GOOGLE_DRIVE_FOLDER_ID);
  console.log(`[Drive] ${files.length} files found — loading in batches of 10`);

  async function fetchOne(file) {
    try {
      let content = "";
      if (file.mimeType === "application/vnd.google-apps.document") {
        const res = await withTimeout(drive.files.export({ fileId: file.id, mimeType: "text/plain" }), 15000);
        content = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      } else if (file.mimeType === "text/plain" || file.mimeType === "text/markdown") {
        const res = await withTimeout(drive.files.get({ fileId: file.id, alt: "media" }), 15000);
        content = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      } else {
        return null;
      }
      const trimmed = content.trim();
      return {
        name:         file.name,
        content:      trimmed,
        contentLower: trimmed.toLowerCase(),
      };
    } catch (err) {
      console.error(`[Drive] Skipped: ${file.name} — ${err.message}`);
      return null;
    }
  }

  const entries = [];
  for (let i = 0; i < files.length; i += 10) {
    const results = await Promise.all(files.slice(i, i + 10).map(fetchOne));
    entries.push(...results.filter(Boolean));
    console.log(`[Drive] Batch ${Math.floor(i/10)+1}/${Math.ceil(files.length/10)} — ${entries.length} loaded`);
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
// STOP WORDS
// ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","what","who","when","where","how",
  "did","do","does","in","of","to","and","or","for","with","about","that",
  "this","it","he","she","they","we","i","me","my","his","her","their","our",
  "have","has","had","been","be","will","would","could","should","can","may",
  "tell","show","give","find","get","any","all","some","from","at","by","on",
  "please","explain","describe","list","just","also","very","really","quite",
]);

// ─────────────────────────────────────────────────────────────
// RETRIEVAL
// Pure content scoring — reads what's INSIDE documents
// No categories, no snippets, no keyword matching tricks
// Top 3 docs sent in full to AI
// ─────────────────────────────────────────────────────────────

const MAX_CHARS = 15000;
const MAX_DOCS  = 3;

async function retrieveRelevantContext(question) {
  await buildDocumentIndex();
  if (_index.length === 0) return { context: "", sourceNote: "Drive unavailable" };

  // Extract meaningful words from the question
  const personName  = extractPersonName(question);
  const personParts = personName
    ? personName.replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 2)
    : [];

  const questionWords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const allTerms = [...new Set([...questionWords, ...personParts])];

  console.log(`[Retrieve] person=${personName || "none"} | terms=[${allTerms.slice(0,8).join(",")}]`);

  // Score every document purely on how many times the terms appear in content
  const scored = _index.map(doc => {
    let score = 0;

    for (const term of allTerms) {
      const count = (doc.contentLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      score += count * 5;
    }

    // Person name gets extra weight — full name matches score highest
    if (personName) {
      const safeName = personName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fullNameCount = (doc.contentLower.match(new RegExp(safeName, "g")) || []).length;
      score += fullNameCount * 15;
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

  // Send full content of each top doc — no cutting, no snippets
  let combined = "";
  const names  = [];

  for (const doc of topDocs) {
    const remaining = MAX_CHARS - combined.length;
    if (remaining <= 300) break;
    const block = `\n\n=== DOCUMENT: ${doc.name} ===\n${doc.content}`;
    combined += block.length > remaining ? block.substring(0, remaining) : block;
    names.push(doc.name);
  }

  console.log(`[Retrieve] ${names.length} docs | ${combined.length} chars (~${Math.round(combined.length/4)} tokens)`);
  return { context: combined.trim(), sourceNote: names.join(", ") };
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  isGreeting,
  retrieveRelevantContext,
  extractPersonName,
  fetchAllDriveDocuments,
  buildDocumentIndex,
};