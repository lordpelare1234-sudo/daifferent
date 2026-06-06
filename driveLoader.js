const { google } = require("googleapis");
const path = require("path");

let driveCache = null;
let cacheTime = null;
const CACHE_DURATION = 1000 * 60 * 15;

async function getDriveClient() {
  const keyFile = path.join(__dirname, "pj-archive-ffed9a15b0fd.json");
  
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFile,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
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

module.exports = { fetchAllDriveDocuments };