import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const DASHBOARD_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(DASHBOARD_DIR, "..");
const app = express();
const PORT = 3000;

let generatorProcess = null;

const statusPath = path.join(ROOT_DIR, "config", "status.json");
const generatedDir = path.join(ROOT_DIR, "videos", "generated");
const projectBackgroundsDir = path.join(ROOT_DIR, "videos", "backgrounds");
const localBackgroundsDir = "C:\\Users\\Lenni\\Desktop\\_Backgrounds_for_Azuko_Generation_LLC";
const backgroundsDir = fs.existsSync(localBackgroundsDir) ? localBackgroundsDir : projectBackgroundsDir;
const readyDir = path.join(ROOT_DIR, "config", "ready-to-post");
const logPath = path.join(ROOT_DIR, "config", "logs", "generator.log");
const settingsPath = path.join(ROOT_DIR, "config", "settings.json");
const backupsDir = path.join(ROOT_DIR, "backups");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(DASHBOARD_DIR));
app.use("/videos/generated", express.static(generatedDir));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

[generatedDir, projectBackgroundsDir, readyDir, path.dirname(logPath), path.dirname(statusPath), backupsDir].forEach(ensureDir);
if (!fs.existsSync(localBackgroundsDir)) {
  console.log(`Lokaler Background-Ordner nicht gefunden, nutze Projekt-Ordner: ${projectBackgroundsDir}`);
}

function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function folderSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    total += stat.isDirectory() ? folderSize(full) : stat.size;
  }
  return total;
}

function listFiles(dir, exts) {
  ensureDir(dir);
  return fs.readdirSync(dir)
    .filter(f => exts.includes(path.extname(f).toLowerCase()))
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { name: f, size: stat.size, created: stat.birthtime };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));
}

app.get("/", (req, res) => res.sendFile(path.join(DASHBOARD_DIR, "index.html")));

app.get("/api/status", (req, res) => {
  const s = readJsonSafe(statusPath, {
    running: false,
    stage: "idle",
    message: "Bereit",
    progress: 0,
    output: null
  });
  if (generatorProcess) s.running = true;
  res.json(s);
});

app.get("/api/videos", (req, res) => {
  res.json(listFiles(generatedDir, [".mp4"]).map(v => ({
    ...v,
    url: "/videos/generated/" + encodeURIComponent(v.name)
  })));
});

app.get("/api/backgrounds", (req, res) => {
  res.json(listFiles(backgroundsDir, [".mp4", ".mov", ".webm", ".mkv"]));
});

app.get("/api/download/:file", (req, res) => {
  const safe = path.basename(req.params.file);
  const file = path.join(generatedDir, safe);
  if (!fs.existsSync(file)) return res.status(404).send("Video nicht gefunden");
  res.download(file, safe);
});

app.get("/api/ready", (req, res) => {
  ensureDir(readyDir);
  const items = fs.readdirSync(readyDir)
    .filter(f => f.endsWith(".json"))
    .map(f => readJsonSafe(path.join(readyDir, f), null))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

app.post("/api/ready/:id/posted", (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const file = path.join(readyDir, `${id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  const data = readJsonSafe(file, {});
  data.posted = true;
  data.postedAt = new Date().toISOString();
  writeJson(file, data);
  res.json({ ok: true });
});

app.delete("/api/ready/:id", (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const file = path.join(readyDir, `${id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: "Ready item nicht gefunden" });

  const data = readJsonSafe(file, {});
  const deleted = [];
  const errors = [];

  function removeIfExists(target) {
    if (!target || !fs.existsSync(target)) return;
    try { fs.unlinkSync(target); deleted.push(path.basename(target)); }
    catch (err) { errors.push(`${path.basename(target)}: ${err.message}`); }
  }

  removeIfExists(file);
  if (data.videoFile) removeIfExists(path.join(generatedDir, path.basename(data.videoFile)));
  if (data.thumbnailFile) removeIfExists(path.join(generatedDir, path.basename(data.thumbnailFile)));
  if (data.coverFrame) removeIfExists(path.join(generatedDir, path.basename(data.coverFrame)));

  res.json({ ok: errors.length === 0, deleted, errors });
});

app.get("/api/modules", (req, res) => {
  res.json([
    { id: "fake-reddit", title: "Fake Reddit Story Engine", status: "active", statusLabel: "Active", icon: "🧵", description: "AITA, Family Drama, Inheritance, Revenge und mehr." },
    { id: "roblox-rant", title: "Roblox Rant Engine", status: "planned", statusLabel: "Planned", icon: "🎮", description: "Deutsch + Englisch, Ragebait, Emojis und Rant-Energy." },
    { id: "gangster-fruits", title: "Gangster Fruits Engine", status: "planned", statusLabel: "Planned", icon: "🍒", description: "Fruit stories with AI images per scene and insider characters." },
    { id: "series", title: "Series Engine", status: "planned", statusLabel: "Planned", icon: "🎬", description: "Parts, recurring characters and story history across engines." },
    { id: "ad-engine", title: "Ad Engine", status: "soon", statusLabel: "Coming later", icon: "🔒", description: "Product images → TikTok/Shorts ads. Placeholder only." }
  ]);
});

app.post("/api/admin/login", (req, res) => {
  const user = String(req.body.user || "azuko").trim().toLowerCase();
  res.json({ ok: user === "azuko" });
});

function getChannelState() {
  const status = readJsonSafe(statusPath, { stage: "idle", message: "Bereit", progress: 0, running: false });
  const readyItems = fs.existsSync(readyDir)
    ? fs.readdirSync(readyDir).filter(f => f.endsWith(".json")).map(f => readJsonSafe(path.join(readyDir, f), null)).filter(Boolean)
    : [];
  const videos = listFiles(generatedDir, [".mp4"]);
  const backgrounds = listFiles(backgroundsDir, [".mp4", ".mov", ".webm", ".mkv"]);
  return {
    current: {
      running: !!generatorProcess || !!status.running,
      stage: status.stage || "idle",
      message: status.message || "Bereit",
      progress: status.progress || 0,
      updatedAt: status.updatedAt || null,
      output: status.output || null,
      config: status.config || null
    },
    backgroundsPath: backgroundsDir,
    usingDesktopBackgrounds: backgroundsDir === localBackgroundsDir,
    recentReady: readyItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8),
    recentVideos: videos.slice(0, 8),
    backgrounds: backgrounds.slice(0, 12)
  };
}


function nextScheduleSlot(index = 0) {
  const slots = ["08:00", "12:00", "16:00", "20:00", "23:00"];
  const now = new Date();
  const base = new Date(now);
  for (let day = 0; day < 14; day++) {
    for (const slot of slots) {
      const [h, m] = slot.split(":").map(Number);
      const d = new Date(base);
      d.setDate(now.getDate() + day);
      d.setHours(h, m, 0, 0);
      if (d > now) {
        if (index === 0) return d;
        index--;
      }
    }
  }
  return new Date(now.getTime() + 3600_000);
}

function getYoutubeScheduleItems() {
  const readyItems = fs.existsSync(readyDir)
    ? fs.readdirSync(readyDir).filter(f => f.endsWith(".json")).map(f => readJsonSafe(path.join(readyDir, f), null)).filter(Boolean)
    : [];
  return readyItems
    .filter(x => !x.posted)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((x, i) => ({
      id: x.id,
      title: x.youtubeTitle || x.title,
      videoFile: x.videoFile,
      channel: x.youtubeSchedule?.channel || "Reddit Stories",
      scheduledTime: x.youtubeSchedule?.scheduledTime || nextScheduleSlot(i).toLocaleString(),
      status: x.youtubeSchedule?.status || "prepared",
      thumbnail: x.youtubeSchedule?.thumbnail || "best-frame-auto"
    }));
}

function getChannels() {
  return [
    { name: "TikTok Fake Reddit", status: "Prepared", purpose: "Fake Reddit Stories · semi-auto" },
    { name: "TikTok Fruits", status: "Future", purpose: "Fruit videos · semi-auto" },
    { name: "YouTube Roblox Rant DE", status: "Future", purpose: "Roblox Rant · German" },
    { name: "YouTube Roblox Rant EN", status: "Future", purpose: "Roblox Rant · English" },
    { name: "YouTube Fruits", status: "Future", purpose: "Fruit videos · auto later" }
  ];
}

app.get("/api/channel", (req, res) => {
  res.json(getChannelState());
});

app.get("/api/youtube-schedule", (req, res) => {
  res.json({ items: getYoutubeScheduleItems(), channels: getChannels() });
});

function getChangelog() {
  return [
    {
      version: "v1.9.3",
      title: "Core Foundation / Page System",
      date: "2026-06-21",
      items: [
        "[+] Control Center pages added: Settings, Social Links, Assets, Changelog, Backup, Lab and System now open as real views.",
        "[+] Login screen footer added with About, Impressum, Contact and social buttons.",
        "[+] Social links and Contact Email from Control Center now appear on the login screen.",
        "[/] Control Center navigation changed from scroll-jumps to a cleaner page system.",
        "[/] Foundation improved for future Channel Profiles, Users, Voice Presets and v2 Engines."
      ]
    },
    {
      version: "v1.9.1",
      title: "SaaS Polish + Control Center Fix",
      date: "2026-06-21",
      items: [
        "[/] Branding cleaned: HighPerformerNetwork is no longer a big title; powered by HighPerformerNetwork is enough.",
        "[/] Cinematic Local Creator Dashboard wording replaced with Azuko Engine Dashboard.",
        "[/] Control Center layout aligned with the clean Overview dashboard style.",
        "[+] Small top-right profile menu added for Overview, Control Center, Settings, Assets, Changelog and Logout.",
        "[+] Social link settings added for Twitch, TikTok, YouTube, Discord and Contact Email.",
        "[+] About / Impressum / Contact structure prepared for future SaaS/website pages."
      ]
    },
    {
      version: "v1.9.3",
      title: "SaaS Foundation",
      date: "2026-06-20",
      items: [
        "[+] Cinematic + clean Login Screen with verified High Performer.",
        "[+] New SaaS navigation: Overview, Create, Ready, Scheduler, Analytics, Control Center.",
        "[+] Azuko Engine(s) cards: Fake Reddit, Roblox Rant, Gangster Fruits, Series, Ad Engine placeholder.",
        "[+] Voice Presets, Subtitle Settings, Backup, Cleanup and Lab foundation prepared.",
        "[/] Ready To Post cleaned into compact cards with details on click.",
        "[/] Control Center prepared as Admin/Settings replacement.",
        "[-] Old Home/Videos/Pläne navigation wording reduced."
      ]
    },
    {
      version: "v1.8",
      date: "2026-06-19",
      items: [
        "Story Length Control Info eingebaut: 15s, 30s und 1:02 zeigen jetzt Ziel-Wörter, geschätzte Voice-Länge und Mode-Erklärung.",
        "Story Preview zeigt jetzt zusätzliche Länge-Fakten: Target, Words, Mode und Estimate.",
        "Admin Erklärung ergänzt: Home, Preview, Story-Länge, TikTok Ready, YouTube Scheduler und Admin-Funktion werden direkt im Control Center erklärt."
      ]
    },
    {
      version: "v1.7.8",
      date: "2026-06-19",
      items: [
        "Story Preview Fehler robuster gemacht: Wenn der Preview-Prozess hängt oder eine alte Funktion fehlt, kommt ein Fallback statt Preview failed.",
        "Alter makeDescription-Fehler wird durch einen Status-Reset entfernt.",
        "Version/Changelog aktualisiert und Preview-Fehleranzeige klarer gemacht."
      ]
    },
    {
      version: "v1.7.7",
      date: "2026-06-19",
      items: [
        "Story Preview als optionaler Haken eingebaut: aus = direkt rendern, an = Story vorher ansehen.",
        "Regenerate Story und Render This Story hinzugefügt, damit genau die Preview gerendert wird.",
        "Fertig-Video Toast unten bekommt X Button und direkten Download Button."
      ]
    },
    {
      version: "v1.7.6",
      date: "2026-06-19",
      items: [
        "Simple/Code Mode aus der großen Karte entfernt und clean nach oben rechts neben das Admin-Profil verschoben.",
        "Process View bleibt gleich: Simple für normale Ansicht, Code für technischen Ablauf.",
        "Dashboard wirkt dadurch aufgeräumter und minimalistischer."
      ]
    },
    {
      version: "v1.7.5",
      date: "2026-06-19",
      items: [
        "Branding final korrigiert: powered by HighPerformerNetwork bleibt sichtbar.",
        "Groß-/Kleinschreibung von HighPerformerNetwork bleibt exakt erhalten."
      ]
    },
    {
      version: "v1.7.4",
      date: "2026-06-19",
      items: [
        "Branding angepasst: powered by HighPerformerNetwork steht jetzt direkt unter Azuko Generation LLC.",
        "Footer-Signatur entfernt, damit das Dashboard cleaner bleibt."
      ]
    },
    {
      version: "v1.7.2",
      title: "Description Fix + Footer",
      date: new Date().toLocaleDateString(),
      items: [
        "Fehler makeDescription is not defined gefixt, damit TikTok Ready wieder erstellt wird.",
        "powered by HighPerformerNetwork unter Azuko Generation LLC gesetzt statt als Footer.",
        "Connected Channels bereinigt, damit dort nur Kanäle stehen und keine Changelog-Daten."
      ]
    },
    {
      version: "v1.7.1",
      title: "Story Engine v2",
      date: new Date().toLocaleDateString(),
      items: [
        "Lokale Story-Generierung stark erweitert: neue Templates pro Kategorie statt nur wenige Beispielstorys.",
        "Variable Namen, Orte, Objekte, Beträge, Beweise und Twists eingebaut, damit Storys frischer wirken.",
        "Anti-Wiederholung mit config/story-history.json hinzugefügt.",
        "Clickbait/Curiosity Titel erweitert und abwechslungsreicher gemacht.",
        "Story Engine schreibt im Status, welches Template gerade benutzt wurde."
      ]
    },
    {
      version: "v1.7",
      title: "Auto Pipeline + Tracking",
      date: new Date().toLocaleDateString(),
      items: [
        "Render Workflow erweitert: TikTok Ready und YouTube Scheduler werden automatisch vorbereitet.",
        "Live Activity zeigt jetzt eine echte Historie der letzten Aktionen statt nur den aktuellen Status.",
        "Error Center hinzugefügt, damit Render-, Voice- oder Background-Probleme sichtbar werden.",
        "TikTok Ready mit Copy-All Box und viralem Clickbait/Curiosity Stil verbessert.",
        "YouTube Scheduler mit Multi-Channel Vorbereitung und Auto-Slot Logik aufgeräumt."
      ]
    },
    {
      version: "v1.6",
      title: "Admin Control Center",
      date: new Date().toLocaleDateString(),
      items: [
        "Admin neu unterteilt in Dashboard, Live Activity, Changelog, Statistics, Assets und System.",
        "Alter Channel-Block entfernt, weil Ready, Videos und Backgrounds jetzt sauber getrennt sind.",
        "Versionsanzeige und Last Updated Anzeige hinzugefügt.",
        "Minimalistisches Admin-Design verbessert."
      ]
    },
    {
      version: "v1.5.1",
      title: "Ready Delete + Admin Clean",
      date: "Previous",
      items: [
        "Delete Button in Ready To Post hinzugefügt.",
        "Delete Confirmation eingebaut.",
        "Admin als Kontrollbereich vereinfacht.",
        "Von Admin geht Navigation nur zurück zu Home."
      ]
    },
    {
      version: "v1.5",
      title: "Simple Mode + Code Mode",
      date: "Previous",
      items: [
        "Simple Mode für einfache Bedienung eingebaut.",
        "Code Mode für technischen Prozess-Überblick eingebaut.",
        "TikTok Ready-To-Post mit viralen Hashtags vorbereitet.",
        "YouTube Scheduler Preview und Multi-Channel Struktur vorbereitet."
      ]
    },
    {
      version: "v1.4.3",
      title: "Subtitle Fix",
      date: "Previous",
      items: [
        "Untertitel-Position korrigiert.",
        "Untertitel besser lesbar gemacht.",
        "Layout so angepasst, dass Captions nicht mehr oben abgeschnitten werden."
      ]
    },
    {
      version: "v1.4.2",
      title: "Local Backgrounds + Admin Login",
      date: "Previous",
      items: [
        "Desktop Background Ordner eingebaut.",
        "Admin Login ohne Passwort eingebaut.",
        "Erste Admin-Statusansicht erstellt."
      ]
    }
  ];
}

function readLogLines(limit = 100) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(-limit);
}

function parseLogLine(line) {
  const match = line.match(/^\[(.*?)\]\s+([^:]+):\s*(.*)$/);
  if (!match) return { label: "Log", value: line, status: "ok" };
  const [, time, stage, message] = match;
  const normalized = stage.toLowerCase();
  const bad = /error|failed|fehler/.test(`${normalized} ${message.toLowerCase()}`);
  const active = /rendering|running|voiceover|subtitles|story|background|starting|queued/.test(normalized);
  return {
    time,
    label: stage,
    value: message,
    status: bad ? "bad" : active ? "active" : "ok"
  };
}

function getLiveActivity() {
  const s = readJsonSafe(statusPath, { stage: "idle", message: "Bereit", progress: 0, updatedAt: null });
  const history = readLogLines(80).map(parseLogLine).reverse();
  const outputName = s.output ? path.basename(s.output) : null;
  const current = [
    { label: "System", value: generatorProcess ? "Generator läuft" : "Bereit", status: generatorProcess ? "active" : "ok" },
    { label: "Stage", value: `${s.stage || "idle"} · ${s.progress || 0}%`, status: s.stage === "error" ? "bad" : "ok" },
    { label: "Message", value: s.message || "Bereit", status: s.stage === "error" ? "bad" : "ok" }
  ];
  if (outputName) current.push({ label: "Latest Output", value: outputName, status: "ok" });
  if (s.config?.storyType) current.push({ label: "Current Config", value: `${s.config.storyType} · ${s.config.storyMode || "question"} · ${s.config.language || "en"}`, status: "ok" });
  return history.length ? history : current;
}

function getErrorCenter() {
  const s = readJsonSafe(statusPath, { stage: "idle", message: "Bereit", progress: 0 });
  const errors = readLogLines(120)
    .map(parseLogLine)
    .filter(x => x.status === "bad")
    .reverse();

  if (s.stage === "error" && s.message && !errors.some(x => x.value === s.message)) {
    errors.unshift({ time: new Date().toLocaleTimeString(), label: "Current Error", value: s.message, status: "bad" });
  }

  return {
    status: errors.length ? "needs-attention" : "clean",
    count: errors.length,
    items: errors.slice(0, 25)
  };
}

app.get("/api/admin", (req, res) => {
  const videos = listFiles(generatedDir, [".mp4"]);
  const backgrounds = listFiles(backgroundsDir, [".mp4", ".mov", ".webm", ".mkv"]);
  const readyItems = fs.existsSync(readyDir)
    ? fs.readdirSync(readyDir).filter(f => f.endsWith(".json")).map(f => readJsonSafe(path.join(readyDir, f), null)).filter(Boolean)
    : [];
  const settings = readJsonSafe(settingsPath, { cleanupDays: 14, username: "Azuko", labCode: "44", contactEmail: "", socialLinks: { twitch: "", tiktok: "", youtube: "", discord: "" } });
  const logTail = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf8").split(/\r?\n/).slice(-40).join("\n")
    : "";
  const unposted = readyItems.filter(x => !x.posted).length;
  const scheduled = getYoutubeScheduleItems().length;
  const videoSize = folderSize(generatedDir);
  const bgSize = folderSize(backgroundsDir);

  res.json({
    version: "Azuko Generation LLC v1.9.3",
    lastUpdated: new Date().toLocaleString(),
    dashboard: {
      systemStatus: generatorProcess ? "Rendering" : "Online",
      videosCreated: videos.length,
      readyToPost: unposted,
      youtubeScheduled: scheduled,
      backgroundVideos: backgrounds.length
    },
    liveActivity: getLiveActivity(),
    changelog: getChangelog(),
    statistics: {
      totalVideos: videos.length,
      totalRenders: videos.length,
      readyItems: readyItems.length,
      postedItems: readyItems.filter(x => x.posted).length,
      youtubePrepared: scheduled,
      errorCount: getErrorCenter().count,
      averageRenderTime: "Coming soon",
      mostUsedCategory: readyItems[0]?.storyType || "Noch keine Daten",
      videosSize: videoSize
    },
    assets: {
      backgroundsPath: backgroundsDir,
      usingDesktopBackgrounds: backgroundsDir === localBackgroundsDir,
      backgroundsCount: backgrounds.length,
      backgroundsSize: bgSize,
      recentBackgrounds: backgrounds.slice(0, 6),
      generatedVideosPath: generatedDir
    },
    system: {
      node: process.version,
      dashboard: "ONLINE",
      generator: generatorProcess ? "RUNNING" : "READY",
      backgroundsPath: backgroundsDir,
      readyPath: readyDir,
      generatedPath: generatedDir,
      logPath
    },
    youtubeSchedule: getYoutubeScheduleItems(),
    channels: getChannels(),
    connectedAccounts: {
      youtube: { status: "prepared", label: "Google Login kommt später", channels: getChannels().filter(c => c.status !== "Future") },
      tiktok: { status: "ready-to-post-only", label: "Copy/Paste Ready, API später" }
    },
    errorCenter: getErrorCenter(),
    settings,
    backup: { folder: backupsDir, status: "ready" },
    logTail
  });
});


app.get("/api/settings", (req, res) => {
  res.json(readJsonSafe(settingsPath, { cleanupDays: 14, username: "Azuko", labCode: "44", contactEmail: "", socialLinks: { twitch: "", tiktok: "", youtube: "", discord: "" } }));
});

app.post("/api/settings", (req, res) => {
  const defaults = { cleanupDays: 14, username: "Azuko", labCode: "44", contactEmail: "", socialLinks: { twitch: "", tiktok: "", youtube: "", discord: "" } };
  const current = readJsonSafe(settingsPath, defaults);
  const next = { ...current };
  if (Object.prototype.hasOwnProperty.call(req.body, "cleanupDays")) {
    next.cleanupDays = req.body.cleanupDays === "Never" ? "Never" : Number(req.body.cleanupDays || current.cleanupDays || 14);
  }
  if (typeof req.body.contactEmail === "string") next.contactEmail = req.body.contactEmail.trim();
  if (req.body.socialLinks && typeof req.body.socialLinks === "object") {
    next.socialLinks = {
      ...(current.socialLinks || {}),
      twitch: String(req.body.socialLinks.twitch || "").trim(),
      tiktok: String(req.body.socialLinks.tiktok || "").trim(),
      youtube: String(req.body.socialLinks.youtube || "").trim(),
      discord: String(req.body.socialLinks.discord || "").trim()
    };
  }
  next.updatedAt = new Date().toISOString();
  writeJson(settingsPath, next);
  res.json({ ok: true, settings: next });
});

function copyDirSafe(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const item of fs.readdirSync(src)) {
    const from = path.join(src, item);
    const to = path.join(dest, item);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDirSafe(from, to);
    else fs.copyFileSync(from, to);
  }
}

app.post("/api/backup", (req, res) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `backup_${stamp}`;
    const dest = path.join(backupsDir, name);
    ensureDir(dest);
    copyDirSafe(path.join(ROOT_DIR, "config"), path.join(dest, "config"));
    const meta = { createdAt: new Date().toISOString(), version: "v1.9.3", note: "Background videos and large exports are not copied." };
    writeJson(path.join(dest, "backup-meta.json"), meta);
    res.json({ ok: true, name, path: dest });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function normalizeGeneratorConfig(body = {}) {
  return {
    source: body.source || "local",
    storyType: body.storyType || "family-drama",
    storyMode: body.storyMode || "question",
    subreddit: body.subreddit || "AskReddit",
    keywords: body.keywords || "",
    direction: body.direction || "strong hook",
    language: body.language || "en",
    voiceGender: body.voiceGender || "female",
    duration: Number(body.duration || 30),
    platform: body.platform || "both",
    previewStory: body.previewStory || "",
    previewModeTag: body.previewModeTag || ""
  };
}

function pickPreview(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makeFallbackStoryPreview(config) {
  const type = String(config.storyType || "family-drama").toLowerCase();
  const mode = String(config.storyMode || "question").toLowerCase();
  const pools = {
    "aita": [
      "I told my family I would not pay for a vacation they planned without asking me. They called me selfish until I showed them the group chat where they admitted they only invited me because they needed my card. Now everyone is quiet, except my aunt, who says I embarrassed them on purpose.",
      "My roommate ate my meal prep for the third time this week, so I stopped cooking extra food. They said I was being petty, but then I found out they had been telling our friends I was their personal chef. I finally sent screenshots, and now the whole apartment is awkward."
    ],
    "family-drama": [
      "My family invited me to dinner and acted like everything was normal. Halfway through, my uncle asked why I had not signed the paper they left in my room. That is when I realized the dinner was not about family at all. It was about getting me to give up something they wanted.",
      "My sister told everyone I ruined her birthday. What she left out was that she used my card to book the whole party without asking. When I showed the receipt, my mom still said I should have just let it go because family matters more than money."
    ],
    "inheritance": [
      "After my grandfather died, my family said he left me nothing. I believed them until a lawyer called and asked why I had not replied to three letters. The moment I mentioned the letters, my aunt went pale and suddenly wanted to talk in private.",
      "My cousins laughed when they said I was not in the will. Then the lawyer opened the last envelope and asked why my name was written on the property documents. The room went silent, and my aunt immediately tried to grab the folder."
    ],
    "revenge": [
      "My coworker took credit for my work for months. I stayed quiet because I knew one day they would present the wrong file. When that day came, my manager asked one question, and my coworker realized every document had my name hidden in the edit history.",
      "They tried to get me kicked out of the group chat by spreading fake screenshots. I did not argue. I just waited until everyone was online, then sent the original conversation with timestamps. Suddenly nobody wanted to talk about loyalty anymore."
    ],
    "cheating": [
      "I ordered food to my partner's apartment because they said they were sick. The delivery photo showed someone else wearing their hoodie at the door. When I asked about it, they said it was their cousin. Then the cousin posted the same hoodie in a mirror selfie.",
      "My boyfriend said he was working late, but his location showed a restaurant across town. I almost ignored it until the receipt hit our shared email. Dinner for two, dessert included, and a name I recognized from his office."
    ],
    "work-drama": [
      "My boss blamed me in a meeting for a mistake I did not make. I asked him to open the project history on the screen. The room went quiet when everyone saw his edits were made ten minutes before the deadline and mine were locked two days earlier.",
      "My coworker kept saying I was lazy. Then they forgot to mute during a video call and admitted they had been deleting my assigned tasks so I would look bad. HR asked me to stay after the meeting, but not for the reason they expected."
    ],
    "crazy-neighbor": [
      "My packages kept disappearing, and my neighbor kept acting surprised. So I left a box with a tracker inside. It moved straight to their garage, then stopped next to three other boxes with my name still on them.",
      "My neighbor complained about noise every night at exactly 9 PM, even when I was not home. I installed a camera in my hallway. The next complaint came while the footage showed them standing outside my door knocking on the wall themselves."
    ],
    "mystery": [
      "Every night at 3:17, my old phone lit up even though it had no SIM card. I thought it was broken until one message appeared with my childhood address. The next morning, I found the same number written inside a book my dad never let me open.",
      "I found a locked box behind the bathroom mirror in my apartment. Inside was a photo of the room before it was renovated, but there was one detail that made no sense. In the photo, someone was standing exactly where I was standing."
    ]
  };
  let story = pickPreview(pools[type] || pools["family-drama"]);
  if (mode === "question") story += " Was I wrong for refusing to pretend nothing happened?";
  else if (mode === "hard") story += " Then I saw the final message... Follow for Part 2.";
  else if (mode === "soft") story += " And the worst part is, I still have not told them what I found next.";
  return {
    ok: true,
    fallback: true,
    story,
    words: story.split(/\s+/).filter(Boolean).length,
    modeTag: mode || "preview",
    storyType: type,
    language: config.language || "en"
  };
}

function runStoryPreview(config) {
  return new Promise((resolve, reject) => {
    const p = spawn("node", ["generator/reddit-generator.js"], {
      cwd: ROOT_DIR,
      shell: true,
      env: { ...process.env, STORY_PREVIEW_ONLY: "1", GENERATOR_CONFIG_JSON: JSON.stringify(config) }
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try { p.kill(); } catch {}
      reject(new Error("Story Preview timeout"));
    }, 25000);
    p.stdout.on("data", d => out += d.toString());
    p.stderr.on("data", d => err += d.toString());
    p.on("error", e => { clearTimeout(timer); reject(e); });
    p.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err || `Preview failed with code ${code}`));
      try {
        const first = out.indexOf("{");
        const last = out.lastIndexOf("}");
        const json = first >= 0 && last >= first ? out.slice(first, last + 1) : out;
        resolve(JSON.parse(json));
      } catch (e) {
        reject(new Error("Preview JSON konnte nicht gelesen werden."));
      }
    });
  });
}

app.post("/api/story-preview", async (req, res) => {
  if (generatorProcess) return res.status(409).json({ ok: false, error: "Generator läuft gerade. Preview danach erneut starten." });
  let config = null;
  try {
    config = normalizeGeneratorConfig(req.body);
    const preview = await runStoryPreview(config);
    res.json(preview);
  } catch (err) {
    try {
      const fallback = makeFallbackStoryPreview(config || normalizeGeneratorConfig(req.body || {}));
      fallback.warning = err.message || "Story Preview fallback genutzt";
      res.json(fallback);
    } catch (fallbackErr) {
      res.json({
        ok: true,
        fallback: true,
        warning: fallbackErr.message || "Story Preview fallback genutzt",
        story: "I thought it was going to be a normal family argument. Then I found the message they forgot to delete, and everything changed. The worst part was not what they did. It was how long they had planned it.",
        words: 39,
        modeTag: "fallback",
        storyType: "fallback",
        language: "en"
      });
    }
  }
});

app.post("/api/generate", (req, res) => {
  if (generatorProcess) return res.status(409).json({ error: "Generator läuft bereits." });

  const config = normalizeGeneratorConfig(req.body);

  writeJson(statusPath, {
    running: true,
    stage: "queued",
    message: "Generator wird gestartet...",
    progress: 1,
    output: null,
    config,
    updatedAt: new Date().toISOString()
  });

  generatorProcess = spawn("node", ["generator/reddit-generator.js"], {
    cwd: ROOT_DIR,
    shell: true,
    env: { ...process.env, GENERATOR_CONFIG_JSON: JSON.stringify(config) }
  });

  generatorProcess.stdout.on("data", d => process.stdout.write(d.toString()));
  generatorProcess.stderr.on("data", d => process.stderr.write(d.toString()));
  generatorProcess.on("close", () => { generatorProcess = null; });
  generatorProcess.on("error", err => {
    generatorProcess = null;
    writeJson(statusPath, { running: false, stage: "error", message: err.message, progress: 0, output: null });
  });

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log("  Azuko Generation LLC läuft");
  console.log("========================================");
  console.log(`  http://localhost:${PORT}`);
  console.log("");
});
