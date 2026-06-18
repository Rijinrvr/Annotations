const express = require("express");
const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

/**
 * Parse a datetime string like "2026-06-11 20:14:45.583" into ms timestamp.
 */
function parseDateTimeValue(dtStr) {
  if (!dtStr) return 0;
  return new Date(dtStr.trim()).getTime() || 0;
}

app.get("/", (req, res) => {
  res.render("index", {
    allRecords: [],
    keepRecords: [],
    deleteRecords: [],
    error: null,
    data: "",
  });
});

app.post("/process", (req, res) => {
  const rawData = req.body.data || "";

  if (!rawData.trim()) {
    return res.render("index", {
      allRecords: [],
      keepRecords: [],
      deleteRecords: [],
      error: "Input is empty!",
      data: rawData,
    });
  }

  const lines = rawData
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

  const tokenRegex = /^\S+$/;
  const idRegex = /^\d+$/;

  const allRecords = [];
  let skippedLines = 0;

  lines.forEach((line) => {
    // Support tab-separated or multiple-space-separated
    const parts = line.split(/\t|\s{2,}/).map((p) => p.trim());

    // Skip header rows
    if (
      parts[0].toLowerCase() === "client_token" ||
      parts[0].toLowerCase() === "token"
    ) {
      return;
    }

    if (
      parts.length >= 3 &&
      tokenRegex.test(parts[0]) &&
      idRegex.test(parts[1])
    ) {
      // datetime may be split across parts[2] and parts[3] if space between date and time
      const dateStr =
        parts.length >= 4 ? parts[2] + " " + parts[3] : parts[2];

      allRecords.push({
        token: parts[0].toUpperCase(),
        id: parts[1],
        date: dateStr,
        dateValue: parseDateTimeValue(dateStr),
      });
    } else {
      skippedLines++;
    }
  });

  if (allRecords.length === 0) {
    return res.render("index", {
      allRecords: [],
      keepRecords: [],
      deleteRecords: [],
      error:
        "No valid records found. Expected format: Client_Token [tab] Annotation_ID [tab] Updated_Date",
      data: rawData,
    });
  }

  // Group allRecords by token
  const groups = {};
  allRecords.forEach((rec) => {
    if (!groups[rec.token]) {
      groups[rec.token] = [];
    }
    groups[rec.token].push(rec);
  });

  const keepRecordsList = [];
  const deleteRecordsList = [];

  Object.keys(groups).forEach((token) => {
    const group = groups[token];
    // Sort group by dateValue ascending (oldest first). Tie-break with numerical ID.
    group.sort((a, b) => {
      if (a.dateValue !== b.dateValue) {
        return a.dateValue - b.dateValue;
      }
      return parseInt(a.id, 10) - parseInt(b.id, 10);
    });

    // Retain only the oldest generated record (index 0)
    keepRecordsList.push(group[0]);

    // Mark all subsequent records for deletion
    for (let i = 1; i < group.length; i++) {
      deleteRecordsList.push(group[i]);
    }
  });

  // Sort keep and delete lists by token (alphabetical), then by date/id
  const keepRecords = keepRecordsList.sort((a, b) => {
    const tokenComp = a.token.localeCompare(b.token);
    if (tokenComp !== 0) return tokenComp;
    return a.dateValue - b.dateValue || parseInt(a.id, 10) - parseInt(b.id, 10);
  });

  const deleteRecords = deleteRecordsList.sort((a, b) => {
    const tokenComp = a.token.localeCompare(b.token);
    if (tokenComp !== 0) return tokenComp;
    return a.dateValue - b.dateValue || parseInt(a.id, 10) - parseInt(b.id, 10);
  });

  // Mark allRecords with isKeep flag
  const keepIdSet = new Set(keepRecords.map((r) => r.id));
  allRecords.forEach((rec) => {
    rec.isKeep = keepIdSet.has(rec.id);
  });

  const errorMsg =
    skippedLines > 0
      ? `${skippedLines} line(s) were skipped — ensure each line is: Client_Token [tab/spaces] Annotation_ID [tab/spaces] DateTime`
      : null;

  res.render("index", {
    allRecords,
    keepRecords,
    deleteRecords,
    error: errorMsg,
    data: rawData,
  });
});

app.listen(3000, () => console.log("Server running at http://localhost:3000"));
