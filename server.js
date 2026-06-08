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
// CACHE
// ─────────────────────────────────────────────────────────────

const memCache = new Map();

function memGet(key)        { return memCache.get(key) || null; }
function memSet(key, value) { memCache.set(key, value); }
function cacheKey(route, q) { return `${route}::${q}`; }

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
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert on the Madeleine McCann case with access to the original PJ archive documents.

You are having a real one-on-one conversation with someone who wants to understand this case. Talk like a knowledgeable person having a genuine discussion — not like a search engine, not like a report writer.

HOW TO ANSWER:
- Read every document provided carefully before answering
- Answer directly from what the documents say — use the actual details, names, times, and facts in them
- If the documents mention something relevant, use it — do not ignore details
- If the archive doesn't cover it, use your broader knowledge of the case and say so naturally ("From what I know outside the archive...")
- Never say you couldn't find something or ask the user to provide more files — just answer
- Never make up facts or present theories as confirmed

HOW TO TALK:
- Speak naturally and conversationally — like you're explaining this to a friend who is genuinely curious
- Keep responses focused and clear — don't waffle or pad with unnecessary text
- For follow-up questions, continue the conversation naturally — you remember what was just discussed
- If someone asks "what else?" or "and then?" just carry on like a normal conversation
- Don't use bullet points and headers for every answer — sometimes a natural paragraph is better
- Match the energy — if someone asks a quick question, give a focused answer; if they want detail, go deep

If the question has nothing to do with the Madeleine McCann case, just say: "I only cover the Madeleine McCann case — ask me anything about that."`;


// ─────────────────────────────────────────────────────────────
// FOLLOW-UP DETECTOR
// Short conversational replies that don't need a new Drive search
// ─────────────────────────────────────────────────────────────

function isConversationalFollowUp(question) {
  const q         = question.trim().toLowerCase();
  const wordCount = q.split(/\s+/).length;

  if (wordCount > 10) return false;

  const patterns = [
    /^so(\s|$)/,
    /^and(\s|$)/,
    /^but(\s|$)/,
    /^what about/,
    /^what else/,
    /^tell me more/,
    /^really\??\.?$/,
    /^are they/,
    /^were they/,
    /^is (she|he|it|that)/,
    /^was (she|he|it|that)/,
    /^did (she|he|they)/,
    /^how (so|did|does|was|were)/,
    /^why (did|was|were|is)/,
    /^(so )?(they|she|he) (are|were|is|was)/,
    /^any (more|other)/,
    /^what happened (then|next|after)/,
    /^what did (she|he|they)/,
    /^correct\??\.?$/,
    /^right\??\.?$/,
    /^interesting\.?$/,
    /^go on\.?$/,
    /^continue\.?$/,
    /^ok(ay)?\??\.?$/,
    /^wow\.?$/,
    /^seriously\??\.?$/,
    /^no way\.?$/,
    /^makes sense\.?$/,
    /^and (she|he|they)/,
    /^then what/,
    /^why (that|so)/,
  ];

  return patterns.some(p => p.test(q));
}


// ─────────────────────────────────────────────────────────────
// CORE PIPELINE
// ─────────────────────────────────────────────────────────────

async function queryArchiveAI(question, history = []) {
  const q = question.trim().toLowerCase();

  // Greeting
  if (isGreeting(q)) return GREETING_REPLY;

  const isFollowUp      = history.length > 0;
  const isShortFollowUp = isFollowUp && isConversationalFollowUp(question);
  const key             = cacheKey("/ai-search", q);

  // Cache — standalone questions only
  if (!isFollowUp) {
    const memHit = memGet(key);
    if (memHit) { console.log(`[Cache] MEM HIT`); return memHit; }
    const dbHit = await dbGet("/ai-search", q);
    if (dbHit) { console.log(`[Cache] DB HIT`); memSet(key, dbHit); return dbHit; }
  }

  // Drive retrieval — skip for short conversational replies
  let archiveContext = "";

  if (!isShortFollowUp) {
    const { context, sourceNote } = await retrieveRelevantContext(question);
    if (context) {
      archiveContext = `=== ARCHIVE DOCUMENTS (${sourceNote}) ===\n\n${context}\n\n=== END OF ARCHIVE ===`;
    } else {
      archiveContext = "No matching archive documents found. Answer from broader case knowledge.";
    }
    console.log(`[AI] ${archiveContext.length} chars | ${sourceNote}`);
  } else {
    console.log(`[AI] Conversational follow-up — from history`);
  }

  // Build messages
  const userContent = isShortFollowUp
    ? question
    : `${archiveContext}\n\nQuestion: ${question}`;

  const messages = [...history, { role: "user", content: userContent }];

  // Call AI
  const response = await axios.post(
    "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
    {
      model: "mimo-v2-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

  // Cache standalone only
  if (!isFollowUp) {
    memSet(key, answer);
    dbSet("/ai-search", q, answer);
  }

  return answer;
}


// ─────────────────────────────────────────────────────────────
// AI SEARCH ROUTE
// ─────────────────────────────────────────────────────────────

app.post("/ai-search", async (req, res) => {
  const question = (req.body.question || "").trim();
  const history  = req.body.history  || [];
  if (!question) return res.json({ answer: "Please enter a question." });
  try {
    const answer = await queryArchiveAI(question, history);
    res.json({ answer });
  } catch (err) {
    console.error("[AI Search]", err.response?.data || err.message);
    res.json({ answer: "Service error — please try again." });
  }
});

// Keep all other routes pointing to the same AI pipeline
// so every tab on your frontend still works
app.post("/timeline-search",       async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/witness-search",        async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/forensics-search",      async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/phone-search",          async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/maps-search",           async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/photograph-search",     async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/transcript-search",     async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/correspondence-search", async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/police-search",         async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/theories-search",       async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});
app.post("/rogatory-search",       async (req, res) => { const q = (req.body.question||"").trim(); const h = req.body.history||[]; if (!q) return res.json({answer:"Please enter a question."}); try { res.json({answer: await queryArchiveAI(q,h)}); } catch(e) { res.json({answer:"Service error."}); }});


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
    const { context, sourceNote } = await retrieveRelevantContext(question);
    res.json({
      question,
      sourceNote,
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