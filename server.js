require("dotenv").config();

const express  = require("express");
const session  = require("express-session");
const axios    = require("axios");
const supabase = require("./supabase");
const upload   = require("./uploadConfig");

const {
  isGreeting,
  retrieveRelevantContext,
  fetchAllDriveDocuments,
  detectCategory,
  extractPersonName,
} = require("./driveLoader");

const { createClient } = require("@supabase/supabase-js");

const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const app = express();

app.use(express.json());
app.use(express.static("public"));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 },
}));


// ─────────────────────────────────────────────────────────────
// LAYER 1 — IN-PROCESS MEMORY CACHE  (< 1ms, lives with process)
// ─────────────────────────────────────────────────────────────

const memCache = new Map();

function memGet(key)        { return memCache.get(key) || null; }
function memSet(key, value) { memCache.set(key, value); }
function cacheKey(route, q) { return `${route}::${q}`; }


// ─────────────────────────────────────────────────────────────
// LAYER 2 — SUPABASE CACHE  (persists across restarts)
// Only read on memory miss. Write is always fire-and-forget.
// ─────────────────────────────────────────────────────────────

const CACHE_TTL_DAYS = 15;

async function dbGet(route, question) {
  try {
    const { data } = await supabase
      .from("question_cache")
      .select("answer")
      .eq("route", route)
      .eq("question", question)
      .gt("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * CACHE_TTL_DAYS).toISOString())
      .single();
    return data ? data.answer : null;
  } catch (_) { return null; }
}

function dbSet(route, question, answer) {
  // Fire-and-forget — never blocks the response
  supabase
    .from("question_cache")
    .upsert({ route, question, answer, hit_count: 1 }, { onConflict: "route,question" })
    .then(() => {})
    .catch(err => console.error("[DB Cache] Write failed:", err.message));
}


// ─────────────────────────────────────────────────────────────
// GREETING
// ─────────────────────────────────────────────────────────────

const GREETING_REPLY = "Hello! I specialise in the Madeleine McCann archive. What would you like to know?";


// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────────────────────

const SOURCE_RULE = "\n\nSource priority: (1) Provided archive documents — always cite which document. (2) Broader Madeleine McCann case knowledge if archive is insufficient — label clearly as [External Knowledge].";

const prompts = {

  aiSearch: `You are PJ Archive AI, an expert assistant on the Madeleine McCann investigation.
Answer questions using the supplied archive documents as your primary source.
Supplement with broader case knowledge if needed — label it clearly.
If the question is unrelated to the case, reply only: "Sorry, I can only answer questions about the Madeleine McCann case."
Structure responses as: Confirmed Facts | Witness/Police/Forensic Findings | Theories (labelled) | Source Used.
Never invent evidence. Never present theories as facts. Remain neutral.`,

  timeline: `You are PJ Timeline AI, specialist in the chronological record of the Madeleine McCann case.
Specialise in: precise dates/times, chronological sequencing, movements of all parties, contradictions and gaps.
Be precise with dates and times. Note disputes clearly. Highlight contradictions. Keep to 1-3 paragraphs.`,

  witness: `You are PJ Witness AI, specialist in witness testimony in the Madeleine McCann case.
Specialise in: statements, sighting reports, key claims, contradictions within and between accounts.
Accurately represent statements. Identify witnesses by name. Highlight contradictions. Keep to 1-3 paragraphs.`,

  forensics: `You are PJ Forensics AI, specialist in physical and scientific evidence in the Madeleine McCann case.
Specialise in: DNA, cadaver/blood dogs (Eddie/Keela), luminol, lab reports, chain of custody, forensic limitations.
Be precise about what was found, where, and what labs concluded. Note all limitations. Do not overstate. Keep to 1-3 paragraphs.`,

  phone: `You are PJ Phone Records AI, specialist in telecommunications evidence in the Madeleine McCann case.
Specialise in: call records, SMS, cell tower data, communications timelines, contact analysis.
Be precise about times, durations, parties. Cross-reference with timeline. Highlight contradictions. Keep to 1-3 paragraphs.`,

  maps: `You are PJ Maps AI, specialist in locations and spatial analysis in the Madeleine McCann case.
Specialise in: Praia da Luz locations, Ocean Club layout, Apartment 5A, distances, routes, geographic context for sightings.
Be precise about distances and spatial relationships. Relate to events and witness accounts. Keep to 1-3 paragraphs.`,

  photographs: `You are PJ Photograph AI, specialist in photographic and visual evidence in the Madeleine McCann case.
Specialise in: holiday photographs, CCTV records, visual evidence analysis, metadata, evidentiary significance.
Be precise about what images show and do not show. Do not speculate beyond documentation. Keep to 1-3 paragraphs.`,

  transcripts: `You are PJ Transcript AI, specialist in interview transcripts in the Madeleine McCann case.
Specialise in: transcripts, police interview content, key statements, admissions, denials, contradictions across sessions.
Quote or paraphrase accurately. Identify subject and date. Highlight contradictions. Keep to 1-3 paragraphs.`,

  correspondence: `You are PJ Correspondence AI, specialist in written communications in the Madeleine McCann case.
Specialise in: police/prosecutor/legal letters, inter-agency communications, official decisions made in writing.
Be precise about sender, recipient, date. Accurately represent content. Highlight significant claims. Keep to 1-3 paragraphs.`,

  police: `You are PJ Police Records AI, specialist in official investigative actions in the Madeleine McCann case.
Specialise in: initial response, search operations, arguido status, PJ/GNR/Met/Operation Grange, official reports, documented failures.
Be precise about dates, agencies, actions. Distinguish between bodies. Represent criticisms fairly. Keep to 1-3 paragraphs.`,

  theories: `You are PJ Theories AI, specialist in evaluating hypotheses in the Madeleine McCann case.
Specialise in: comparing theories against evidence, separating fact from inference/speculation, evidentiary weight, logical gaps.
Always label fact vs theory. Present all significant theories fairly. Identify supporting/contradicting evidence. Never endorse beyond the evidence. Keep to 1-3 paragraphs.`,

  rogatory: `You are PJ Rogatory AI, specialist in rogatory interview material in the Madeleine McCann case.
Specialise in: UK rogatory interviews (2007-2008+), Tapas group statements, contradictions vs earlier Portuguese accounts, refusals to answer.
Identify interviewee and date. Accurately quote/paraphrase. Highlight contradictions. Keep to 1-3 paragraphs.`,

};

console.log("[Routes] Prompts loaded:", Object.keys(prompts).join(", "));


// ─────────────────────────────────────────────────────────────
// CORE PIPELINE
// ─────────────────────────────────────────────────────────────

async function queryArchiveAI(systemPrompt, question, route) {
  const q = question.trim().toLowerCase();

  // 1. Instant greeting — zero cost
  if (isGreeting(q)) {
    console.log("[AI] Greeting — instant reply");
    return GREETING_REPLY;
  }

  const key = cacheKey(route, q);

  // 2. Memory cache — < 1ms
  const memHit = memGet(key);
  if (memHit) {
    console.log(`[Cache] MEM HIT: ${q.substring(0, 60)}`);
    return memHit;
  }

  // 3. Supabase cache — survives restarts
  const dbHit = await dbGet(route, q);
  if (dbHit) {
    console.log(`[Cache] DB HIT: ${q.substring(0, 60)}`);
    memSet(key, dbHit); // warm memory for next call
    return dbHit;
  }

  console.log(`[Cache] MISS — calling AI: ${q.substring(0, 60)}`);

  // 4. Smart retrieval — top 3 docs, max 8,000 chars, pure in-memory
  const { context, sourceNote } = await retrieveRelevantContext(question);

  const archiveContext = context
    ? `=== ARCHIVE SOURCES: ${sourceNote} ===\n\n${context}`
    : "=== ARCHIVE: No matching documents found. Use external case knowledge and label it. ===";

  console.log(`[AI] ${archiveContext.length} chars (~${Math.round(archiveContext.length / 4)} tokens) | ${sourceNote}`);

  // 5. AI call
  const response = await axios.post(
    "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
    {
      model: "mimo-v2-pro",
      messages: [
        { role: "system", content: systemPrompt + SOURCE_RULE },
        { role: "user",   content: archiveContext + "\n\nQuestion:\n" + question },
      ],
    },
    {
      headers: {
        Authorization:  `Bearer ${process.env.MIMO_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30s hard timeout on AI call
    }
  );

  const answer = response.data.choices[0].message.content;

  // 6. Cache result — memory instantly, DB fire-and-forget
  memSet(key, answer);
  dbSet(route, q, answer);

  return answer;
}


// ─────────────────────────────────────────────────────────────
// ROUTE FACTORY
// ─────────────────────────────────────────────────────────────

function createRoute(path, promptKey) {
  app.post(path, async (req, res) => {
    const question = (req.body.question || "").trim();
    if (!question) return res.json({ answer: "Please enter a question." });
    try {
      const answer = await queryArchiveAI(prompts[promptKey], question, path);
      res.json({ answer });
    } catch (err) {
      console.error(`[${promptKey}]`, err.response?.data || err.message);
      res.json({ answer: "Service error — please try again." });
    }
  });
}


// ─────────────────────────────────────────────────────────────
// AI ROUTES
// ─────────────────────────────────────────────────────────────

createRoute("/ai-search",             "aiSearch");
createRoute("/timeline-search",       "timeline");
createRoute("/witness-search",        "witness");
createRoute("/forensics-search",      "forensics");
createRoute("/phone-search",          "phone");
createRoute("/maps-search",           "maps");
createRoute("/photograph-search",     "photographs");
createRoute("/transcript-search",     "transcripts");
createRoute("/correspondence-search", "correspondence");
createRoute("/police-search",         "police");
createRoute("/theories-search",       "theories");
createRoute("/rogatory-search",       "rogatory");


// ─────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authClient.auth.signInWithPassword({ email, password });
    if (result.error) return res.json({ success: false, message: result.error.message });
    req.session.user = { id: result.data.user.id, email: result.data.user.email };
    req.session.save(err => {
      if (err) return res.status(500).json({ success: false, message: "Session save failed" });
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/me", async (req, res) => {
  if (!req.session.user) return res.json({ authenticated: false });
  const { data, error } = await supabase.from("profiles").select("*").eq("id", req.session.user.id);
  if (error) return res.json({ authenticated: false, reason: error.message });
  if (!data || data.length === 0) {
    return res.json({ authenticated: true, user: { id: req.session.user.id, username: req.session.user.email, role: "user" } });
  }
  res.json({ authenticated: true, user: data[0] });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authClient.auth.signUp({ email, password });
    if (result.error) return res.json({ success: false, message: result.error.message });
    const { error } = await supabase.from("profiles").insert({ id: result.data.user.id, username: email, role: "user" });
    if (error) return res.json({ success: false, message: error.message });
    res.json({ success: true, message: "Account created successfully" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});


// ─────────────────────────────────────────────────────────────
// FILE / STORAGE ROUTES
// ─────────────────────────────────────────────────────────────

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.json({ success: false, message: "No file uploaded" });
    const fileName = Date.now() + "_" + req.file.originalname;
    const { data, error } = await supabase.storage.from("archive-documents").upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
    if (error) return res.json({ success: false, message: error.message });
    res.json({ success: true, message: "File uploaded successfully", file: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/files", async (req, res) => {
  try {
    const { data, error } = await supabase.storage.from("archive-documents").list("", { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });
    if (error) return res.json({ success: false, message: error.message });
    res.json({ success: true, files: data || [] });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.get("/file-url/:name", async (req, res) => {
  try {
    const { data, error } = await supabase.storage.from("archive-documents").createSignedUrl(req.params.name, 3600);
    if (error) return res.json({ success: false, message: error.message });
    res.json({ success: true, url: data.signedUrl });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.delete("/delete-file/:name", async (req, res) => {
  try {
    const { error } = await supabase.storage.from("archive-documents").remove([req.params.name]);
    if (error) return res.json({ success: false, message: error.message });
    res.json({ success: true, message: "File deleted" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.get("/public-files", async (req, res) => {
  const { data, error } = await supabase.storage.from("archive-documents").list();
  if (error) return res.json({ success: false, message: error.message });
  res.json({ success: true, files: data });
});


// ─────────────────────────────────────────────────────────────
// RECORDS ROUTES
// ─────────────────────────────────────────────────────────────

app.post("/save-record", async (req, res) => {
  try {
    const { title, category, record_date, source, summary, content } = req.body;
    const { error } = await supabase.from("archive_records").insert([{ title, category, record_date, source, summary, content }]);
    if (error) return res.json({ success: false, message: error.message });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.get("/records", async (req, res) => {
  const { data, error } = await supabase.from("archive_records").select("*").order("created_at", { ascending: false });
  if (error) return res.json({ success: false });
  res.json({ success: true, records: data });
});


// ─────────────────────────────────────────────────────────────
// DIAGNOSTIC ROUTES
// ─────────────────────────────────────────────────────────────

app.get("/test-drive", async (req, res) => {
  try {
    const result = await fetchAllDriveDocuments();
    res.json({ success: true, summary: result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/debug-retrieval", async (req, res) => {
  const question = (req.body.question || "").trim();
  try {
    const category = detectCategory(question);
    const person   = extractPersonName(question);
    const { context, sourceNote } = await retrieveRelevantContext(question);
    res.json({
      question, category, person, sourceNote,
      contextChars:    context.length,
      estimatedTokens: Math.round(context.length / 4),
      contextPreview:  context.substring(0, 500),
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/cache-stats", (req, res) => {
  res.json({
    memoryCacheEntries: memCache.size,
    keys: [...memCache.keys()].map(k => k.substring(0, 80)),
  });
});


// ─────────────────────────────────────────────────────────────
// STATIC
// ─────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});


// ─────────────────────────────────────────────────────────────
// START — server listens immediately, Drive builds in background
// ─────────────────────────────────────────────────────────────

app.listen(5000, () => {
  console.log("[Server] Running on port 5000");
  fetchAllDriveDocuments()
    .then(msg => console.log("[Drive]", msg))
    .catch(err => console.error("[Drive] Index failed:", err.message));
});