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
// LAYER 1 — IN-PROCESS MEMORY CACHE
// ─────────────────────────────────────────────────────────────

const memCache = new Map();

function memGet(key)        { return memCache.get(key) || null; }
function memSet(key, value) { memCache.set(key, value); }
function cacheKey(route, q) { return `${route}::${q}`; }


// ─────────────────────────────────────────────────────────────
// LAYER 2 — SUPABASE CACHE (5 minute TTL)
// ─────────────────────────────────────────────────────────────

const CACHE_TTL_MINS = 5;

async function dbGet(route, question) {
  try {
    const { data } = await supabase
      .from("question_cache")
      .select("answer")
      .eq("route", route)
      .eq("question", question)
      .gt("created_at", new Date(Date.now() - 1000 * 60 * CACHE_TTL_MINS).toISOString())
      .single();
    return data ? data.answer : null;
  } catch (_) { return null; }
}

function dbSet(route, question, answer) {
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
Supplement with broader case knowledge if needed — label it clearly as [External Knowledge].
When asked about any person — even peripheral figures, friends, acquaintances, or minor contacts — search thoroughly across ALL document types: witness statements, rogatory interviews, phone records, correspondence, police reports, and transcripts. They may appear as a secondary reference rather than a primary subject.
If a person is not a central figure, clearly explain their role, how they connect to key witnesses or suspects, and what documents reference them.
Maintain a natural, conversational tone. Answer follow-up questions with full awareness of the prior conversation — if the user says "what else did she say" or "what about the timeline", you know who and what they are referring to.
If the question is unrelated to the case, reply only: "Sorry, I can only answer questions about the Madeleine McCann case."
Structure responses as: Who They Are | Confirmed Facts from Archive | Connections to Key Figures | Source Used.
Never invent evidence. Never present theories as facts. Remain neutral.`,

  timeline: `You are PJ Timeline AI, specialist in the chronological record of the Madeleine McCann case.
Specialise in: precise dates/times, chronological sequencing, movements of all parties — including peripheral contacts and acquaintances — contradictions and gaps.
Maintain a natural conversational tone across follow-up questions. If the user references "she", "he", "they" or "that night", use the conversation history to understand who and what they mean.
When a person is mentioned, trace their movements and any communications involving them across the full timeline.
Be precise with dates and times. Note disputes clearly. Highlight contradictions. Keep to 1-3 paragraphs.`,

  witness: `You are PJ Witness AI, specialist in witness testimony in the Madeleine McCann case.
Specialise in: statements, sighting reports, key claims, contradictions within and between accounts.
When asked about a person, check whether they appear in ANY witness statement — not just as the primary subject but as someone mentioned by another witness.
Maintain a natural conversational tone. Answer follow-up questions with full awareness of prior exchanges — "what else did she say" or "any contradictions" should be answered in context.
Accurately represent statements. Identify witnesses by name. Highlight contradictions. Keep to 1-3 paragraphs.`,

  forensics: `You are PJ Forensics AI, specialist in physical and scientific evidence in the Madeleine McCann case.
Specialise in: DNA, cadaver/blood dogs (Eddie/Keela), luminol, lab reports, chain of custody, forensic limitations.
Maintain a natural conversational tone across follow-up questions.
Be precise about what was found, where, and what labs concluded. Note all limitations. Do not overstate. Keep to 1-3 paragraphs.`,

  phone: `You are PJ Phone Records AI, specialist in telecommunications evidence in the Madeleine McCann case.
Specialise in: call records, SMS, cell tower data, communications timelines, contact analysis.
Maintain a natural conversational tone across follow-up questions.
Be precise about times, durations, parties. Cross-reference with timeline. Highlight contradictions. Keep to 1-3 paragraphs.`,

  maps: `You are PJ Maps AI, specialist in locations and spatial analysis in the Madeleine McCann case.
Specialise in: Praia da Luz locations, Ocean Club layout, Apartment 5A, distances, routes, geographic context for sightings.
Maintain a natural conversational tone across follow-up questions.
Be precise about distances and spatial relationships. Relate to events and witness accounts. Keep to 1-3 paragraphs.`,

  photographs: `You are PJ Photograph AI, specialist in photographic and visual evidence in the Madeleine McCann case.
Specialise in: holiday photographs, CCTV records, visual evidence analysis, metadata, evidentiary significance.
Maintain a natural conversational tone across follow-up questions.
Be precise about what images show and do not show. Do not speculate beyond documentation. Keep to 1-3 paragraphs.`,

  transcripts: `You are PJ Transcript AI, specialist in interview transcripts in the Madeleine McCann case.
Specialise in: transcripts, police interview content, key statements, admissions, denials, contradictions across sessions.
Maintain a natural conversational tone across follow-up questions. If the user says "what did she say next" or "any contradictions", answer in context.
Quote or paraphrase accurately. Identify subject and date. Highlight contradictions. Keep to 1-3 paragraphs.`,

  correspondence: `You are PJ Correspondence AI, specialist in written communications in the Madeleine McCann case.
Specialise in: police/prosecutor/legal letters, inter-agency communications, official decisions made in writing.
Maintain a natural conversational tone across follow-up questions.
Be precise about sender, recipient, date. Accurately represent content. Highlight significant claims. Keep to 1-3 paragraphs.`,

  police: `You are PJ Police Records AI, specialist in official investigative actions in the Madeleine McCann case.
Specialise in: initial response, search operations, arguido status, PJ/GNR/Met/Operation Grange, official reports, documented failures.
Maintain a natural conversational tone across follow-up questions.
Be precise about dates, agencies, actions. Distinguish between bodies. Represent criticisms fairly. Keep to 1-3 paragraphs.`,

  theories: `You are PJ Theories AI, specialist in evaluating hypotheses in the Madeleine McCann case.
Specialise in: comparing theories against evidence, separating fact from inference/speculation, evidentiary weight, logical gaps.
Maintain a natural conversational tone across follow-up questions.
Always label fact vs theory. Present all significant theories fairly. Identify supporting/contradicting evidence. Never endorse beyond the evidence. Keep to 1-3 paragraphs.`,

  rogatory: `You are PJ Rogatory AI, specialist in rogatory interview material in the Madeleine McCann case.
Specialise in: UK rogatory interviews (2007-2008+), Tapas group statements, contradictions vs earlier Portuguese accounts, refusals to answer.
Maintain a natural conversational tone across follow-up questions. If the user says "what else" or "and the timeline", answer in context of the prior exchange.
Identify interviewee and date. Accurately quote/paraphrase. Highlight contradictions. Keep to 1-3 paragraphs.`,

};

console.log("[Routes] Prompts loaded:", Object.keys(prompts).join(", "));


// ─────────────────────────────────────────────────────────────
// FOLLOW-UP DETECTOR
// Detects short conversational replies that don't need a Drive search
// ─────────────────────────────────────────────────────────────

function isConversationalFollowUp(question) {
  const q = question.trim().toLowerCase();

  const wordCount = q.split(/\s+/).length;
  if (wordCount > 8) return false;

  const followUpPatterns = [
    /^so /,
    /^and /,
    /^but /,
    /^what about/,
    /^what else/,
    /^tell me more/,
    /^really\?/,
    /^are they/,
    /^were they/,
    /^is (she|he|it|that)/,
    /^was (she|he|it|that)/,
    /^did (she|he|they)/,
    /^how (so|did|does|was|were)/,
    /^why (did|was|were|is)/,
    /^(so )?(they|she|he) (are|were|is|was)/,
    /^any (more|other|idea)/,
    /^what happened (then|next|after)/,
    /^(and )?what did (she|he|they)/,
    /^(so )?friend/,
    /^correct\??$/,
    /^right\??$/,
    /^interesting/,
    /^makes sense/,
    /^go on/,
    /^continue/,
    /^explain/,
    /^elaborate/,
  ];

  return followUpPatterns.some(p => p.test(q));
}


// ─────────────────────────────────────────────────────────────
// CORE PIPELINE
// ─────────────────────────────────────────────────────────────

async function queryArchiveAI(systemPrompt, question, route, history = []) {
  const q = question.trim().toLowerCase();

  // 1. Instant greeting — zero cost
  if (isGreeting(q)) {
    console.log("[AI] Greeting — instant reply");
    return GREETING_REPLY;
  }

  // 2. Detect follow-up type
  const isFollowUp      = history.length > 0;
  const isShortFollowUp = isFollowUp && isConversationalFollowUp(question);
  const key             = cacheKey(route, q);

  // 3. Cache check — only for standalone questions
  if (!isFollowUp) {
    const memHit = memGet(key);
    if (memHit) {
      console.log(`[Cache] MEM HIT: ${q.substring(0, 60)}`);
      return memHit;
    }

    const dbHit = await dbGet(route, q);
    if (dbHit) {
      console.log(`[Cache] DB HIT: ${q.substring(0, 60)}`);
      memSet(key, dbHit);
      return dbHit;
    }
  }

  console.log(`[Cache] MISS — calling AI: ${q.substring(0, 60)}`);

  // 4. Drive retrieval — skip for short conversational follow-ups
  let archiveContext = "";

  if (!isShortFollowUp) {
    const { context, sourceNote } = await retrieveRelevantContext(question);
    archiveContext = context
      ? `=== ARCHIVE SOURCES: ${sourceNote} ===\n\n${context}`
      : "=== ARCHIVE: No matching documents found. Use external case knowledge and label it. ===";
    console.log(`[AI] ${archiveContext.length} chars (~${Math.round(archiveContext.length / 4)} tokens) | ${sourceNote}`);
  } else {
    console.log(`[AI] Short follow-up — answering from conversation history only`);
  }

  // 5. Build messages — history + current question
  const userContent = isShortFollowUp
    ? question
    : archiveContext + "\n\nQuestion:\n" + question;

  const messages = [
    ...history,
    { role: "user", content: userContent },
  ];

  // 6. AI call
  const response = await axios.post(
    "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
    {
      model: "mimo-v2-pro",
      messages: [
        { role: "system", content: systemPrompt + SOURCE_RULE },
        ...messages,
      ],
    },
    {
      headers: {
        Authorization:  `Bearer ${process.env.MIMO_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const answer = response.data.choices[0].message.content;

  // 7. Cache only standalone questions
  if (!isFollowUp) {
    memSet(key, answer);
    dbSet(route, q, answer);
  }

  return answer;
}


// ─────────────────────────────────────────────────────────────
// ROUTE FACTORY
// ─────────────────────────────────────────────────────────────

function createRoute(path, promptKey) {
  app.post(path, async (req, res) => {
    const question = (req.body.question || "").trim();
    const history  = req.body.history  || [];
    if (!question) return res.json({ answer: "Please enter a question." });
    try {
      const answer = await queryArchiveAI(prompts[promptKey], question, path, history);
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
// START
// ─────────────────────────────────────────────────────────────

app.listen(5000, () => {
  console.log("[Server] Running on port 5000");
  fetchAllDriveDocuments()
    .then(msg => console.log("[Drive]", msg))
    .catch(err => console.error("[Drive] Index failed:", err.message));
});