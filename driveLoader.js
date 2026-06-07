const { google } = require("googleapis");

let driveCache = null;
let cacheTime = null;
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours


async function getDriveClient() {

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }

  const privateKey = rawKey
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .trim();

  console.log("[Drive] Key length:", privateKey.length);
  console.log("[Drive] Has newlines:", privateKey.includes("\n"));

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  const authClient = await auth.getClient();

  return google.drive({ version: "v3", auth: authClient });
}


async function fetchAllDriveDocuments() {

  if (driveCache && cacheTime && Date.now() - cacheTime < CACHE_DURATION) {
    console.log("[Drive] Returning cached documents");
    return driveCache;
  }

  console.log("[Drive] Fetching documents from Google Drive...");

  const drive = await getDriveClient();

  const fileList = await drive.files.list({
    q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 100,
  });

  const files = fileList.data.files || [];
  console.log(`[Drive] Found ${files.length} files`);

  let allContent = "";

  for (const file of files) {
    try {
      let content = "";

      if (file.mimeType === "application/vnd.google-apps.document") {
        const res = await drive.files.export({ fileId: file.id, mimeType: "text/plain" });
        content = res.data;
      } else if (file.mimeType === "text/plain" || file.mimeType === "text/markdown") {
        const res = await drive.files.get({ fileId: file.id, alt: "media" });
        content = res.data;
      } else {
        console.log(`[Drive] Skipping: ${file.name}`);
        continue;
      }

      allContent += `\n\n=== DOCUMENT: ${file.name} ===\n${content}`;
      console.log(`[Drive] Loaded: ${file.name}`);

    } catch (err) {
      console.error(`[Drive] Failed to load ${file.name}:`, err.message);
    }
  }

  driveCache = allContent;
  cacheTime = Date.now();

  return allContent;
}


function filterRelevantDocuments(allContent, question) {

  const docs = allContent.split(/\n\n=== DOCUMENT: /);

  const stopWords = new Set([
    'the','a','an','is','are','was','were','what','who','when','where','how',
    'did','do','does','in','of','to','and','or','for','with','about','that',
    'this','it','he','she','they','we','i','me','my','his','her','their','our',
    'have','has','had','been','be','will','would','could','should','can','may',
    'tell','show','give','find','get','any','all','some','from','at','by','on'
  ]);

  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  console.log(`[Filter] Keywords: ${keywords.join(', ')}`);

  if (keywords.length === 0) {
    return docs.slice(0, 3).join('\n\n=== DOCUMENT: ').substring(0, 20000);
  }

  const scored = docs.map(doc => {
    const docLower = doc.toLowerCase();
    const score = keywords.reduce((acc, kw) => {
      const matches = (docLower.match(new RegExp(kw, 'g')) || []).length;
      return acc + matches;
    }, 0);
    return { doc, score };
  });

  const relevant = scored
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(d => d.doc);

  console.log(`[Filter] ${relevant.length} relevant docs from ${docs.length} total`);

  const result = relevant.length > 0
    ? relevant.join('\n\n=== DOCUMENT: ')
    : docs.slice(0, 2).join('\n\n=== DOCUMENT: ');

  const capped = result.substring(0, 20000);
  console.log(`[Filter] Sending ${capped.length} chars (~${Math.round(capped.length / 4)} tokens)`);

  return capped;
}


module.exports = { fetchAllDriveDocuments, filterRelevantDocuments };