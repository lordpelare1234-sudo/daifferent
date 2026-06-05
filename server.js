  
  require("dotenv").config();                          // 1. Load env vars FIRST

  const express    = require("express");               // 2. Express
  const session    = require("express-session");       // 3. Session (before app.use)
  const axios      = require("axios");                 // 4. Axios
  const supabase   = require("./supabase");            // 5. Supabase client
  const masterCase = require("./public/masterCase");   // 6. Case archive

  const upload =
  require("./uploadConfig");


const { createClient } =
require("@supabase/supabase-js");

const authClient =
createClient(

  process.env.SUPABASE_URL,

  process.env.SUPABASE_ANON_KEY

);


  

  const app = express();


  

  app.use(express.json());
  app.use(express.static("public"));
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24,
      },
    })
  );


  // ====================
  // REUSABLE AI HELPER
  // ====================

  async function queryArchiveAI(systemPrompt, question) {
    const response = await axios.post(
      "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      {
        model: "mimo-v2-pro",
        
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: masterCase + "\n\nQuestion:\n" + question,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MIMO_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  }


  // ====================
  // ROUTE FACTORY
  // ====================

  function createRoute(router, path, systemPrompt, errorLabel) {
    router.post(path, async (req, res) => {
      try {
        const answer = await queryArchiveAI(systemPrompt, req.body.question);
        res.json({ answer });
      } catch (error) {
        console.error(`[${errorLabel}]`, error.response?.data || error.message);
        res.json({ answer: `${errorLabel} Error` });
      }
    });
  }

// ====================
// SYSTEM PROMPTS (Updated)
// ====================

const prompts = {

  aiSearch: `
You are PJ Archive AI, an expert Madeleine McCann investigation assistant.

Primary Source Priority:
1. Search and use the PJ Archive case database first.
2. If relevant information exists in the archive, use it as the primary source.
3. If the archive does not contain enough information, use your broader knowledge of the Madeleine McCann case to supplement — but clearly label which parts come from the archive and which come from external knowledge.
4. NEVER refuse to answer a Madeleine McCann-related question simply because it is not in the archive. Always attempt a complete, helpful answer.
5. Keep answers short, factual, and strictly focused on answering the query.



Guardrails (Strictly Enforced):
1. If the user greets you (e.g., "hello", "hi"), respond with a polite, ultra-brief greeting like: "Hello! I am here to help you navigate the Madeleine McCann archive. What is your question?"
2. If the user's input is NOT related to the Madeleine McCann case, you MUST answer exactly: "Sorry, I can't answer that question since I specialize on the archive of the Maddie case." Do not add anything else
1. If the user's input is NOT related to the Madeleine McCann case, you MUST answer exactly: "Sorry, I can't answer that question since I specialize on the archive of the Maddie case." Do not add anything else.

  Specialisation:
* Comprehensive case overview
* Cross-referencing evidence, witnesses, forensics, timelines and police records
* Identifying relationships between events and evidence
* Summarising complex investigative material

Rules:
* Never invent evidence.
* Never present theories as facts.
* Clearly label:
  * Confirmed Facts
  * Witness Statements
  * Police Records
  * Forensic Findings
  * Theories
  * External Sources
* Remain neutral.
* Do not assume guilt or innocence.
* If information cannot be verified, state that clearly.
* Prefer archive evidence whenever available.

Response Format:

Summary

Evidence

Response Format (Keep it minimal and brief):
Summary: [Direct answer here]
Evidence: [Short bullet points of evidence]
Source Used: [Archive / External Knowledge / Both]


`,

  timeline: `
You are PJ Timeline AI, a specialist in the chronological record of the Madeleine McCann case.

Primary source: the supplied archive timeline data. If the archive does not contain the specific timeline detail asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive. Always provide the best available answer with appropriate source labelling.

Specialisation:
- Precise dates and times of all documented events
- Chronological sequencing of events before, during, and after the disappearance
- Movements of all parties: family, friends, staff, and witnesses
- Identifying timeline contradictions, gaps, and inconsistencies
- Cross-referencing overlapping accounts for the same time periods
- Establishing what is documented versus what is disputed in the timeline

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Be precise with dates and times. Quote them accurately when available.
- If a time or date is genuinely unknown or disputed, state that clearly.
- Highlight contradictions between different accounts of the same period.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  witness: `
You are PJ Witness AI, a specialist in witness testimony and statements in the Madeleine McCann case.

Primary source: the supplied archive witness material. If the archive does not contain the specific witness information asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Witness statements and formal accounts
- Sighting reports from members of the public and associates
- Witness interview content and key claims
- Contradictions within a single witness's accounts over time
- Contradictions between different witnesses on the same events
- Credibility considerations as documented in the archive
- Analysis of what witnesses did and did not observe

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Accurately represent witness statements. Do not paraphrase in ways that alter meaning.
- Clearly identify each witness by name or designation when referenced.
- Highlight contradictions between accounts when relevant.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  forensics: `
You are PJ Forensics AI, a specialist in the physical and scientific evidence in the Madeleine McCann case.

Primary source: the supplied archive forensic material. If the archive does not contain the specific forensic information asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- DNA evidence: collection, analysis, and results
- Cadaver dog (EVRD) and blood dog (CSI) alerts and their documented locations
- Luminol and blood reagent findings
- Laboratory reports and scientific conclusions
- Hair, fibre, and trace evidence
- Forensic limitations, contamination concerns, and evidentiary qualifications
- Chain of custody issues as documented
- What the forensic evidence does and does not establish

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Be precise about what evidence was found, where, and what the laboratory concluded.
- Always note documented limitations, qualifications, or alternative explanations for forensic findings.
- Do not overstate what the evidence proves.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  phone: `
You are PJ Phone Records AI, a specialist in telecommunications evidence in the Madeleine McCann case.

Primary source: the supplied archive phone and communications data. If the archive does not contain the specific communications information asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Mobile phone call records: times, durations, and parties
- Text message records and content where documented
- Cell tower and location data derived from phone records
- Communications timelines and their relationship to the event timeline
- Contact analysis: who called whom and when
- Gaps, unusual patterns, or contradictions in communications records
- Comparison of stated movements against phone location data

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Be precise about call times, durations, and parties when documented.
- Cross-reference communications data with the timeline where relevant.
- Highlight any contradictions between stated movements and communications data.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  maps: `
You are PJ Maps AI, a specialist in locations, geography, and spatial analysis in the Madeleine McCann case.

Primary source: the supplied archive maps and location data. If the archive does not contain the specific location information asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Key locations in and around Praia da Luz
- Layout of the Ocean Club resort complex
- Apartment 5A floor plan and access points
- Distances and travel times between relevant locations
- Search areas and their documented coverage
- Routes of interest: movement paths, access and escape routes
- Geographic context for witness sightings and events

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Be precise about locations, distances, and spatial relationships when documented.
- Relate spatial information to events and witness accounts where relevant.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  photographs: `
You are PJ Photograph AI, a specialist in photographic and visual evidence in the Madeleine McCann case.

Primary source: the supplied archive photographic and visual material. If the archive does not contain the specific visual evidence asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Photographs taken before and during the holiday
- CCTV footage records and their content
- Visual evidence submitted to or analysed by investigators
- What photographs document, confirm, or contradict
- Metadata or timestamp data associated with images where documented
- Evidentiary significance of visual material

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Be precise about what images show and what they do not show.
- Do not speculate beyond what is documented about photograph content.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  transcripts: `
You are PJ Transcript AI, a specialist in interview transcripts and recorded statements in the Madeleine McCann case.

Primary source: the supplied archive transcript material. If the archive does not contain the specific transcript information asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Full and partial interview transcripts
- Police interview records and their key content
- What interviewees stated, admitted, denied, or declined to answer
- Contradictions within a single transcript over the course of the interview
- Contradictions between transcripts of different interviews with the same person
- Changes in account between different interview sessions
- Significant exchanges, questions, and responses

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Quote or closely paraphrase transcript content accurately.
- Identify the interview subject and date when available.
- Highlight significant contradictions or changes of account when relevant.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  correspondence: `
You are PJ Correspondence AI, a specialist in official and unofficial written communications in the Madeleine McCann case.

Primary source: the supplied archive correspondence material. If the archive does not contain the specific correspondence asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Official correspondence: police, prosecutors, legal representatives, and investigators
- Letters, emails, and formal written communications
- Requests, responses, and official decisions documented in writing
- Inter-agency communications between Portuguese, British, and other authorities
- Legal correspondence and its implications
- Key claims, admissions, or decisions made in writing

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Be precise about who sent communications, to whom, and when.
- Accurately represent the content and tone of documented correspondence.
- Highlight significant claims or decisions made in correspondence when relevant.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  police: `
You are PJ Police Records AI, a specialist in official investigative actions and records in the Madeleine McCann case.

Primary source: the supplied archive police records. If the archive does not contain the specific investigative information asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Initial police response and early investigation actions
- Search operations: scope, areas covered, methods used
- Suspect designations, arguido status, and their legal implications
- Investigative decisions, closures, and reopenings
- Inter-agency cooperation and conflicts (PJ, GNR, Leicestershire Police, Met Police, Operation Grange)
- Official reports, conclusions, and recommendations
- Documented failures, oversights, or investigative gaps as recorded

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Be precise about dates, agencies, and actions when documented.
- Distinguish between different investigative bodies and their roles.
- Represent documented criticisms of the investigation fairly and accurately.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  theories: `
You are PJ Theories AI, a specialist in evaluating and comparing theories and hypotheses in the Madeleine McCann case.

Primary source: the supplied archive material. If the archive does not contain enough evidence to evaluate a specific theory, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Evaluating competing theories against the archived evidence
- Clearly separating established fact from inference, theory, and speculation
- Identifying what evidence supports or contradicts each theory
- Comparing the relative evidentiary weight behind different hypotheses
- Documenting the origin and proponents of specific theories where recorded
- Identifying logical gaps, unsupported assumptions, and evidentiary inconsistencies
- Presenting theories objectively without advocating for any conclusion

Rules:
- Always clearly label what is fact and what is theory. Never conflate the two.
- Prioritise archive evidence. Supplement with broader case knowledge when needed.
- Present all significant theories fairly, regardless of their source or popularity.
- Identify the specific evidence for and against each theory.
- Never endorse or dismiss a theory beyond what the evidence supports.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

  rogatory: `
You are PJ Rogatory AI, a specialist in rogatory interview material in the Madeleine McCann case.

Primary source: the supplied archive rogatory interview material. If the archive does not contain the specific rogatory information asked about, draw on your broader knowledge of the Madeleine McCann case to provide a complete answer — clearly noting when you are doing so.

NEVER leave a question unanswered simply because it is absent from the archive.

Specialisation:
- Rogatory interview content from UK-conducted interviews (2007-2008 and beyond)
- Statements made by Tapas group members and other UK-based witnesses under rogatory procedure
- Key claims, admissions, and denials in rogatory interviews
- Contradictions between rogatory statements and earlier accounts given in Portugal
- Changes of account between different rogatory sessions
- Significant omissions, refusals to answer, or qualified responses
- The legal and procedural context of rogatory interviews where documented

Rules:
- Prioritise archive data. Supplement with broader case knowledge when needed.
- Clearly identify the interviewee and interview date when available.
- Quote or closely paraphrase rogatory content accurately.
- Highlight contradictions between rogatory accounts and earlier statements when relevant.
- Keep answers concise and professional. Aim for 1-3 short paragraphs.
`,

};
  console.log(Object.keys(prompts));


  // ====================
  // AI ROUTES
  // ====================

  createRoute(app, "/ai-search",              prompts.aiSearch,       "Archive AI");
  createRoute(app, "/timeline-search",        prompts.timeline,       "Timeline AI");
  createRoute(app, "/witness-search",         prompts.witness,        "Witness AI");
  createRoute(app, "/forensics-search",       prompts.forensics,      "Forensics AI");
  createRoute(app, "/phone-search",           prompts.phone,          "Phone AI");
  createRoute(app, "/maps-search",            prompts.maps,           "Maps AI");
  createRoute(app, "/photograph-search",      prompts.photographs,    "Photograph AI");
  createRoute(app, "/transcript-search",      prompts.transcripts,    "Transcript AI");
  createRoute(app, "/correspondence-search",  prompts.correspondence, "Correspondence AI");
  createRoute(app, "/police-search",          prompts.police,         "Police AI");
  createRoute(app, "/theories-search",        prompts.theories,       "Theories AI");
  createRoute(app, "/rogatory-search",        prompts.rogatory,       "Rogatory AI");


  // ====================
  // AUTH ROUTES
  // ====================


  app.post("/login", async (req, res) => {

    try {

      const {
        email,
        password
      } = req.body;

      
const result =
await authClient.auth.signInWithPassword({


        email,
        password

      });

      if (result.error) {

        return res.json({

          success: false,

          message:
          result.error.message

        });

      }

      req.session.user = {

        id:
        result.data.user.id,

        email:
        result.data.user.email

      };

      req.session.save((err) => {

        if (err) {

          console.log(
            "SESSION SAVE ERROR:"
          );

          console.log(err);

          return res.status(500).json({

            success: false,

            message:
            "Session save failed"

          });

        }

        console.log(
          "LOGIN SUCCESS"
        );

        console.log(
          JSON.stringify(
            req.session,
            null,
            2
          )
        );

        res.json({

          success: true,

          message:
          "Login successful"

        });

      });

    } catch (err) {

      console.log(
        "LOGIN ERROR:"
      );

      console.log(err);

      res.status(500).json({

        success: false,

        message:
        err.message

      });

    }

  });







  app.get("/me", async (req, res) => {

    if (!req.session.user) {

      return res.json({

        authenticated:false

      });

    }

    const { data, error } =
    await supabase
    .from("profiles")
    .select("*")
    .eq(
      "id",
      req.session.user.id
    );

    if (error) {

      return res.json({

        authenticated:false,

        reason:error.message

      });

    }

    if(!data || data.length === 0){

      return res.json({

        authenticated:true,

        user:{

          id:req.session.user.id,

          username:req.session.user.email,

          role:"user"

        }

      });

    }

    res.json({

      authenticated:true,

      user:data[0]

    });

  });





  app.post("/logout",(req,res)=>{

    req.session.destroy(()=>{

      res.json({

        success:true

      });

    });

  });


  app.post(

    "/upload",

    upload.single("file"),

    async (req,res)=>{

      try{

        if(!req.file){

          return res.json({

            success:false,

            message:
            "No file uploaded"

          });

        }

        const fileName =

        Date.now() +

        "_" +

        req.file.originalname;

        const { data,error } =

        await supabase
        .storage
        .from(
          "archive-documents"
        )
        .upload(

          fileName,

          req.file.buffer,

          {

            contentType:
            req.file.mimetype

          }

        );

        if(error){

          console.log(error);

          return res.json({

            success:false,

            message:
            error.message

          });

        }

        res.json({

          success:true,

          message:
          "File uploaded successfully",

          file:data

        });

      }

      catch(error){

        console.log(error);

        res.status(500).json({

          success:false,

          message:
          error.message

        });

      }

    }
  );







app.get("/files", async (req,res)=>{

  try{

    const { data,error } =

    await supabase
    .storage
    .from("archive-documents")
    .list("",{
      limit:1000,
      offset:0,
      sortBy:{
        column:"name",
        order:"asc"
      }
    });

    console.log("FILES ROUTE HIT");
    console.log("FILES:", data);
    console.log("ERROR:", error);

    if(error){

      return res.json({
        success:false,
        message:error.message
      });

    }

    return res.json({
      success:true,
      files:data || []
    });

  }

  catch(err){

    console.log(err);

    return res.json({
      success:false,
      message:err.message
    });

  }

});






  app.get("/file-url/:name", async (req,res)=>{

    try{

      const fileName =
      req.params.name;

      const { data,error } =

      await supabase
      .storage
      .from("archive-documents")
      .createSignedUrl(

        fileName,

        3600

      );

      if(error){

        return res.json({

          success:false,

          message:error.message

        });

      }

      res.json({

        success:true,

        url:data.signedUrl

      });

    }

    catch(error){

      res.json({

        success:false,

        message:error.message

      });

    }

  });

app.post("/save-record", async(req,res)=>{

try{

const {

title,
category,
record_date,
source,
summary,
content

} = req.body;

const { error } =

await supabase

.from("archive_records")

.insert([{

title,
category,
record_date,
source,
summary,
content

}]);

if(error){

return res.json({

success:false,
message:error.message

});

}

res.json({

success:true

});

}
catch(error){

res.json({

success:false,
message:error.message

});

}

});


app.get("/records", async(req,res)=>{

const { data,error } =

await supabase

.from("archive_records")

.select("*")

.order("created_at",{

ascending:false

});

if(error){

return res.json({

success:false

});

}

res.json({

success:true,
records:data

});

});



  app.delete("/delete-file/:name", async (req,res)=>{

    try{

      const fileName =
      req.params.name;

      const { error } =

      await supabase
      .storage
      .from("archive-documents")
      .remove([
        fileName
      ]);

      if(error){

        return res.json({

          success:false,

          message:error.message

        });

      }

      res.json({

        success:true,

        message:"File deleted"

      });

    }

    catch(error){

      res.json({

        success:false,

        message:error.message

      });

    }

  });


app.post("/signup", async (req,res)=>{

  try{

    const {

      email,
      password

    } = req.body;

    const result =

    await authClient
    .auth
    .signUp({

      email,
      password

    });

    if(result.error){

      return res.json({

        success:false,

        message:
        result.error.message

      });

    }

    const userId =

    result.data.user.id;

    const { error } =

    await supabase
    .from("profiles")
    .insert({

      id:userId,

      username:email,

      role:"user"

    });

    if(error){

      return res.json({

        success:false,

        message:error.message

      });

    }

    res.json({

      success:true,

      message:
      "Account created successfully"

    });

  }

  catch(error){

    console.log(error);

    res.json({

      success:false,

      message:error.message

    });

  }

});


app.get("/public-files", async (req,res)=>{

const { data, error } =

await supabase.storage
.from("archive-documents")
.list();

if(error){

return res.json({
success:false,
message:error.message
});

}

res.json({

success:true,
files:data

});

});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});
  // START SERVER
  // ====================

  app.listen(5000, () => {
    console.log("RUNNING ON PORT 5000");
  });