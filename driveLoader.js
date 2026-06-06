require("dotenv").config();

const { google } = require("googleapis");

// Cache so we don't hit Drive on every single query
let driveCache = null;
let cacheTime = null;
const CACHE_DURATION = 1000 * 60 * 15; // 15 minutes

async function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT(
    email,
    null,
    privateKey,
    ["https://www.googleapis.com/auth/drive.readonly"]
  );

  return google.drive({ version: "v3", auth });
}

async function fetchAllDriveDocuments() {

  // Return cache if still fresh
  if (driveCache && cacheTime && Date.now() - cacheTime < CACHE_DURATION) {
    console.log("[Drive] Returning cached documents");
    return driveCache;
  }

  console.log("[Drive] Fetching documents from Google Drive...");

  const drive = await getDriveClient();

  // List all files in the folder
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
        // Google Doc — export as plain text
        const res = await drive.files.export({
          fileId: file.id,
          mimeType: "text/plain",
        });
        content = res.data;

      } else if (
        file.mimeType === "text/plain" ||
        file.mimeType === "text/markdown"
      ) {
        // Plain text or markdown — download directly
        const res = await drive.files.get({
          fileId: file.id,
          alt: "media",
        });
        content = res.data;

      } else {
        console.log(`[Drive] Skipping unsupported file type: ${file.name} (${file.mimeType})`);
        continue;
      }

      allContent += `\n\n=== DOCUMENT: ${file.name} ===\n${content}`;
      console.log(`[Drive] Loaded: ${file.name}`);

    } catch (err) {
      console.error(`[Drive] Failed to load ${file.name}:`, err.message);
    }
  }

  // Update cache
  driveCache = allContent;
  cacheTime = Date.now();

  return allContent;
}

module.exports = { fetchAllDriveDocuments };