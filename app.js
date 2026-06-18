const express = require("express");
const path = require("path");
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
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
  const hexTokenRegex = /^0x[a-f0-9]+$/i;
  const dateRegex = /^\d{4}-\d{2}-\d{2}/;

  const allRecords = [];
  let skippedLines = 0;

  // Buffer for multi-line mode (each field on its own line)
  let multiLineBuffer = [];

  lines.forEach((line) => {
    // Support tab-separated, single-space, or multiple-space-separated
    const parts = line.split(/\t|\s+/).map((p) => p.trim()).filter((p) => p !== "");

    // Skip header rows
    if (
      parts[0].toLowerCase() === "client_token" ||
      parts[0].toLowerCase() === "token"
    ) {
      return;
    }

    // Case 1: All fields on a single line (tab or multi-space separated)
    if (
      parts.length >= 3 &&
      tokenRegex.test(parts[0]) &&
      idRegex.test(parts[1])
    ) {
      // Flush any pending multi-line buffer
      if (multiLineBuffer.length > 0) {
        skippedLines += multiLineBuffer.length;
        multiLineBuffer = [];
      }
      // datetime may be split across parts[2] and parts[3] if space between date and time
      const dateStr =
        parts.length >= 4 ? parts[2] + " " + parts[3] : parts[2];

      allRecords.push({
        token: parts[0].toUpperCase(),
        id: parts[1],
        date: dateStr,
        dateValue: parseDateTimeValue(dateStr),
      });
    }
    // Case 2: Single value per line — accumulate into buffer
    else if (parts.length === 1) {
      multiLineBuffer.push(parts[0]);

      // When we have 3 lines buffered, try to form a record
      if (multiLineBuffer.length === 3) {
        const [val1, val2, val3] = multiLineBuffer;

        if (
          tokenRegex.test(val1) &&
          idRegex.test(val2) &&
          dateRegex.test(val3)
        ) {
          allRecords.push({
            token: val1.toUpperCase(),
            id: val2,
            date: val3,
            dateValue: parseDateTimeValue(val3),
          });
        } else {
          skippedLines += 3;
        }
        multiLineBuffer = [];
      }
    } else {
      // Flush buffer — these lines don't fit either pattern
      if (multiLineBuffer.length > 0) {
        skippedLines += multiLineBuffer.length;
        multiLineBuffer = [];
      }
      skippedLines++;
    }
  });

  // Flush any remaining buffer lines
  if (multiLineBuffer.length > 0) {
    skippedLines += multiLineBuffer.length;
  }

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
