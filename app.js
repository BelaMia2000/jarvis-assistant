const command = document.getElementById("command");
const reply = document.getElementById("reply");
const notes = document.getElementById("notes");
const shoppingListEl = document.getElementById("shopping-list");
const todoListEl = document.getElementById("todo-list");
const reminderListEl = document.getElementById("reminder-list");

const wakeWord = "jarvis";

let keepListening = false;
let isRecognizing = false;
let currentRecognition = null;

// Zentrales Gedächtnis-Modul (aktuell lokal, später 1:1 durch MacBook-Sync austauschbar)
const JarvisMemory = {
  keys: {
    notes: "jarvis_notes",
    shopping: "jarvis_shopping_list",
    todos: "jarvis_todos",
    reminders: "jarvis_reminders",
    aiKey: "jarvis_gemini_key"
  },

  getList(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (error) {
      return [];
    }
  },

  saveList(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
  },

  getNotes() {
    return this.getList(this.keys.notes);
  },

  addNote(text) {
    const current = this.getNotes();
    current.push(text);
    this.saveList(this.keys.notes, current);
    return current;
  },

  clearNotes() {
    this.saveList(this.keys.notes, []);
  },

  getShoppingList() {
    return this.getList(this.keys.shopping);
  },

  saveShoppingList(items) {
    this.saveList(this.keys.shopping, items);
  },

  getTodos() {
    return this.getList(this.keys.todos);
  },

  saveTodos(items) {
    this.saveList(this.keys.todos, items);
  },

  // Erinnerungen: [{ text, time (Millisekunden), done }]
  getReminders() {
    return this.getList(this.keys.reminders);
  },

  saveReminders(items) {
    this.saveList(this.keys.reminders, items);
  },

  // KI-Schlüssel bleibt nur auf diesem Gerät (nicht im Code auf GitHub!)
  getAiKey() {
    return localStorage.getItem(this.keys.aiKey) || "";
  },

  saveAiKey(key) {
    if (key) {
      localStorage.setItem(this.keys.aiKey, key);
    } else {
      localStorage.removeItem(this.keys.aiKey);
    }
  }
};

function speak(text) {
  if (!("speechSynthesis" in window) || !text) {
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  utterance.onend = () => {
    if (keepListening) {
      startVoiceRecognition(true);
    }
  };

  window.speechSynthesis.speak(utterance);
}

function setReply(text, shouldSpeak = true) {
  reply.textContent = text;

  if (shouldSpeak) {
    speak(text);
  }
}

// Entfernt Satzzeichen am Ende (die Spracherkennung hängt oft einen Punkt an)
function stripPunctuation(text) {
  return text.trim().replace(/[\s.!?,;:]+$/, "").trim();
}

// Entfernt Füllwörter wie "bitte" oder "noch" aus einem Eintrag
function cleanItem(text) {
  return stripPunctuation(
    text.replace(/\b(bitte|mal|noch|doch|auch|schnell)\b/gi, " ").replace(/\s+/g, " ")
  );
}

function sameItem(a, b) {
  return cleanItem(a).toLowerCase() === cleanItem(b).toLowerCase();
}

function extractCommandWithWakeWord(rawText) {
  const trimmed = rawText.trim();
  const escapedWakeWord = wakeWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wakeRegex = new RegExp(`^${escapedWakeWord}[\\s,:;.-]+(.+)$`, "i");
  const onlyWakeRegex = new RegExp(`^${escapedWakeWord}[\\s.!?]*$`, "i");

  if (onlyWakeRegex.test(trimmed)) {
    return { wakeDetected: true, onlyWake: true, cleanedText: "" };
  }

  const match = trimmed.match(wakeRegex);
  if (match) {
    return { wakeDetected: true, onlyWake: false, cleanedText: match[1].trim() };
  }

  return { wakeDetected: false, onlyWake: false, cleanedText: trimmed };
}

function renderNotes() {
  if (!notes) return;
  const saved = JarvisMemory.getNotes();
  notes.innerHTML = "";

  saved.forEach(note => {
    const li = document.createElement("li");
    li.textContent = note;
    notes.appendChild(li);
  });
}

function renderShoppingList() {
  if (!shoppingListEl) return;
  const items = JarvisMemory.getShoppingList();
  shoppingListEl.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    shoppingListEl.appendChild(li);
  });
}

function addShoppingItems(rawItemsText) {
  const parts = rawItemsText
    .split(/,| und /i)
    .map(part => cleanItem(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const current = JarvisMemory.getShoppingList();
  const added = [];

  parts.forEach(item => {
    const exists = current.some(existing => sameItem(existing, item));
    if (!exists) {
      current.push(item);
      added.push(item);
    }
  });

  JarvisMemory.saveShoppingList(current);
  renderShoppingList();
  return added;
}

function removeShoppingItem(targetItem) {
  const current = JarvisMemory.getShoppingList();
  const remaining = current.filter(item => !sameItem(item, targetItem));

  if (remaining.length === current.length) {
    return false;
  }

  JarvisMemory.saveShoppingList(remaining);
  renderShoppingList();
  return true;
}

function readShoppingList() {
  const items = JarvisMemory.getShoppingList();
  if (items.length === 0) {
    return "Deine Einkaufsliste ist aktuell leer.";
  }
  if (items.length === 1) {
    return `Auf deiner Einkaufsliste steht: ${items[0]}.`;
  }
  return `Auf deiner Einkaufsliste stehen ${items.length} Einträge: ${items.join(", ")}.`;
}

// ---------- To-dos ----------

function renderTodos() {
  if (!todoListEl) return;
  const items = JarvisMemory.getTodos();
  todoListEl.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    todoListEl.appendChild(li);
  });
}

function addTodo(rawText) {
  const item = cleanItem(rawText);
  if (!item) return null;

  const current = JarvisMemory.getTodos();
  if (current.some(existing => sameItem(existing, item))) {
    return "";
  }
  current.push(item);
  JarvisMemory.saveTodos(current);
  renderTodos();
  return item;
}

function completeTodo(rawText) {
  const current = JarvisMemory.getTodos();
  const remaining = current.filter(item => !sameItem(item, rawText));
  if (remaining.length === current.length) return false;
  JarvisMemory.saveTodos(remaining);
  renderTodos();
  return true;
}

function readTodos() {
  const items = JarvisMemory.getTodos();
  if (items.length === 0) {
    return "Du hast aktuell keine offenen Aufgaben.";
  }
  return `Du hast ${items.length} offene Aufgabe(n): ${items.join(", ")}.`;
}

// ---------- Erinnerungen ----------

const numberWords = {
  ein: 1, eine: 1, einer: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5,
  zehn: 10, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50
};

function formatTime(ms) {
  const date = new Date(ms);
  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return `heute um ${time} Uhr`;
  if (date.toDateString() === tomorrow.toDateString()) return `morgen um ${time} Uhr`;
  return `am ${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} um ${time} Uhr`;
}

// Liest Zeitpunkt + Text aus z. B. "um 18 Uhr ans Training", "in 10 Minuten an den Herd", "morgen um 8:30 an Mathe"
function parseReminder(rest) {
  let text = " " + rest + " ";
  const now = new Date();
  let time = null;
  let m;

  // halbe Stunde
  if ((m = text.match(/\s+in\s+(?:einer\s+)?halben\s+stunde\s+/i))) {
    time = now.getTime() + 30 * 60000;
    text = text.replace(m[0], " ");
  }

  // in X Minuten / Stunden
  if (!time && (m = text.match(/\s+in\s+(\d+|[a-zäöüß]+)\s+(minute|minuten|stunde|stunden)\s+/i))) {
    const amount = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : numberWords[m[1].toLowerCase()];
    if (amount) {
      const factor = /stunde/i.test(m[2]) ? 3600000 : 60000;
      time = now.getTime() + amount * factor;
      text = text.replace(m[0], " ");
    }
  }

  // um 18 Uhr / um 18:30 / 18 Uhr 30 / um 8.15
  if (!time && (m = text.match(/\s+(?:um\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*uhr(?:\s+(\d{1,2})(?!\d))?\s+/i) ||
                text.match(/\s+um\s+(\d{1,2})(?:[:.](\d{2}))?\s+/i))) {
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2] || m[3] || "0", 10);
    if (hour <= 23 && minute <= 59) {
      const target = new Date();
      target.setHours(hour, minute, 0, 0);

      const isTomorrow = /\bmorgen\b/i.test(text);
      if (isTomorrow || target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      time = target.getTime();
      text = text.replace(m[0], " ");
    }
  }

  if (!time) return null;

  const reminderText = cleanItem(
    text
      .replace(/\b(heute|morgen)\b/gi, " ")
      .replace(/^[\s,]*(an|ans|am|daran|zu|zum|zur)\b[\s,]*/i, " ")
      .replace(/^[\s,]*dass\b[\s,]*/i, " ")
  );

  return { time, text: reminderText || "deine Erinnerung" };
}

function renderReminders() {
  if (!reminderListEl) return;
  const items = JarvisMemory.getReminders()
    .filter(r => !r.done)
    .sort((a, b) => a.time - b.time);
  reminderListEl.innerHTML = "";

  items.forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${formatTime(r.time)}: ${r.text}`;
    reminderListEl.appendChild(li);
  });
}

function readReminders() {
  const items = JarvisMemory.getReminders().filter(r => !r.done).sort((a, b) => a.time - b.time);
  if (items.length === 0) {
    return "Du hast aktuell keine Erinnerungen.";
  }
  return `Du hast ${items.length} Erinnerung(en): ` +
    items.map(r => `${formatTime(r.time)} ${r.text}`).join(", ") + ".";
}

// Prüft alle 10 Sekunden, ob eine Erinnerung fällig ist (nur solange die App offen ist)
function checkReminders(onStartup = false) {
  const now = Date.now();
  const all = JarvisMemory.getReminders();
  const due = all.filter(r => !r.done && r.time <= now);
  if (due.length === 0) return;

  due.forEach(r => { r.done = true; });
  JarvisMemory.saveReminders(all.filter(r => !r.done || r.time > now - 86400000));
  renderReminders();

  const texts = due.map(r => r.text).join(", ");
  if (onStartup) {
    setReply(`Verpasste Erinnerung: ${texts}.`, false);
  } else {
    setReply(`Erinnerung: ${texts}.`, true);
  }
}

// ---------- Persönliche KI (Google Gemini, kostenlose Stufe) ----------

// Modellnamen ändern sich bei Google öfter. Jarvis probiert sie der Reihe nach.
const AI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];
let workingModel = null;
let aiHistory = [];

const AI_PERSONALITY =
  "Du bist J.A.R.V.I.S., ein persönlicher KI-Butler im Stil von Iron Man: " +
  "intelligent, freundlich, höflich und mit einem Hauch trockenem Humor. " +
  "Antworte immer auf Deutsch und duze die Nutzerin. " +
  "Deine Antworten werden laut vorgelesen: Antworte kurz (meist 1 bis 4 Sätze), " +
  "ohne Aufzählungszeichen, ohne Sternchen, ohne Markdown und ohne Emojis. " +
  "Wenn du etwas nicht sicher weißt oder es aktuelle Infos bräuchte, sag das ehrlich.";

function cleanAiText(text) {
  return text
    .replace(/[*_#`>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function callGemini(model, key) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: AI_PERSONALITY }] },
        contents: aiHistory
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((data.error && data.error.message) || `Fehler ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts) || [];
  return parts.map(p => p.text || "").join(" ").trim();
}

async function askAI(question) {
  const key = JarvisMemory.getAiKey();
  if (!key) {
    return "Für freie Gespräche brauche ich noch deinen KI-Schlüssel. Tippe dazu auf KI-Schlüssel.";
  }

  aiHistory.push({ role: "user", parts: [{ text: question }] });
  aiHistory = aiHistory.slice(-12); // nur die letzten Nachrichten merken

  const models = workingModel ? [workingModel, ...AI_MODELS.filter(m => m !== workingModel)] : AI_MODELS;
  let lastError = null;

  for (const model of models) {
    try {
      const answer = await callGemini(model, key);
      if (!answer) continue;
      workingModel = model;
      aiHistory.push({ role: "model", parts: [{ text: answer }] });
      return cleanAiText(answer);
    } catch (error) {
      lastError = error;
      // Schlüssel falsch -> nicht weiter probieren
      if (error.status === 400 && /api key/i.test(error.message)) break;
      if (error.status === 401 || error.status === 403) break;
      // 404 (Modell gibt es nicht) oder 429 (Limit erreicht) -> nächstes Modell probieren
    }
  }

  aiHistory.pop();

  if (lastError && (lastError.status === 401 || lastError.status === 403 || /api key/i.test(lastError.message))) {
    return "Dein KI-Schlüssel funktioniert nicht. Bitte tippe auf KI-Schlüssel und gib ihn neu ein.";
  }
  if (lastError && lastError.status === 429) {
    return "Das kostenlose Tageslimit der KI ist gerade erreicht. Versuch es später nochmal.";
  }
  if (!navigator.onLine) {
    return "Ich habe gerade keine Internetverbindung.";
  }
  return "Die KI hat gerade nicht geantwortet. Versuch es bitte gleich nochmal.";
}

function generateReply(inputText) {
  // Verhörer der Spracherkennung vereinheitlichen ("Einlaufsliste", "Einkaufs Liste" ...)
  const rawText = stripPunctuation(inputText)
    .replace(/\bein\s?[kl]aufs?\s?liste\b/gi, "Einkaufsliste");
  const text = rawText.toLowerCase();
  const now = new Date();
  let match;

  // ---------- Notizen (vor Uhrzeit, damit "Notiz: 15 Uhr Arzt" gespeichert wird) ----------

  if (text.includes("notizen löschen") || text.includes("alle notizen entfernen")) {
    JarvisMemory.clearNotes();
    renderNotes();
    return "Ich habe alle gespeicherten Notizen gelöscht.";
  }

  if (text.startsWith("notiz:") || text.startsWith("notiz ") || text.startsWith("merke dir ")) {
    const cleaned = rawText.replace(/^(notiz:|notiz|merke dir)\s*/i, "").trim();

    if (!cleaned) {
      return "Was genau soll ich mir notieren?";
    }

    JarvisMemory.addNote(cleaned);
    renderNotes();
    return `Alles klar, ich habe mir notiert: ${cleaned}.`;
  }

  if (/(meine notizen|notizen vorlesen|welche notizen|^notizen$|was steht auf meiner liste)/.test(text)) {
    const saved = JarvisMemory.getNotes();
    if (saved.length === 0) {
      return "Du hast aktuell noch keine Notizen gespeichert.";
    }
    return `Du hast ${saved.length} Notiz(en): ${saved.join(", ")}.`;
  }

  // ---------- Einkaufsliste ----------

  // Leeren
  if (
    text.includes("einkaufsliste löschen") ||
    text.includes("einkaufsliste leeren") ||
    text.includes("einkauf löschen")
  ) {
    JarvisMemory.saveShoppingList([]);
    renderShoppingList();
    return "Ich habe deine Einkaufsliste geleert.";
  }

  // Streichen: "Streiche Milch von der Einkaufsliste" / "Einkaufsliste streichen Milch"
  match =
    rawText.match(/^(?:streiche|streich|lösche|lösch|entferne|nimm)\s+(.+?)\s+(?:von|aus)\s+der\s+einkaufsliste(?:\s+weg)?$/i) ||
    rawText.match(/^(?:von der\s+)?einkaufsliste\s+(?:streichen|entfernen)\s*:?\s*(.*)$/i);

  if (match) {
    const itemToRemove = cleanItem(match[1] || "");
    if (!itemToRemove) {
      return "Welchen Eintrag soll ich von der Einkaufsliste streichen?";
    }
    if (removeShoppingItem(itemToRemove)) {
      return `Ich habe ${itemToRemove} von der Einkaufsliste gestrichen.`;
    }
    return `${itemToRemove} stand nicht auf deiner Einkaufsliste.`;
  }

  // Hinzufügen: "Setze Milch auf die Einkaufsliste" / "Einkaufsliste: Milch und Brot"
  match =
    rawText.match(/^(?:setze|setzte|setzt|setz|setzen|schreibe|schreib|pack|packe|füge|füg|tu|tue|leg|lege)\s+(.+?)\s+(?:auf\s+die|zur|zu\s+der|in\s+die)\s+einkaufsliste(?:\s+(?:hinzu|dazu|drauf))?$/i) ||
    rawText.match(/^(.+?)\s+(?:auf\s+die|zur|in\s+die)\s+einkaufsliste\s+(?:hinzufügen|setzen|schreiben|packen)$/i) ||
    rawText.match(/^(?:setze auf die einkaufsliste|auf die einkaufsliste|einkaufsliste|einkauf)\s*:?\s+(.+)$/i);

  if (match) {
    const rest = match[1].trim();

    // "Einkaufsliste vorlesen" soll vorlesen, nicht "vorlesen" eintragen
    if (/^(vorlesen|lesen|zeigen|anzeigen|bitte|ansagen)$/i.test(rest)) {
      return readShoppingList();
    }

    const added = addShoppingItems(rest);
    if (!added) {
      return "Was soll ich auf die Einkaufsliste setzen?";
    }
    if (added.length === 0) {
      return "Das steht bereits auf deiner Einkaufsliste.";
    }
    return `Ich habe ${added.join(" und ")} auf die Einkaufsliste gesetzt.`;
  }

  // Vorlesen
  if (
    text.includes("einkaufsliste") ||
    text.includes("was muss ich einkaufen") ||
    text.includes("was steht auf dem einkauf")
  ) {
    return readShoppingList();
  }

  // ---------- Erinnerungen (vor Uhrzeit, wegen "Uhr" im Satz) ----------

  if (text.includes("erinnerungen löschen") || text.includes("alle erinnerungen entfernen")) {
    JarvisMemory.saveReminders([]);
    renderReminders();
    return "Ich habe alle Erinnerungen gelöscht.";
  }

  match = rawText.match(/^erinner(?:e|t)?\s+mich\s+(.+)$/i);
  if (match) {
    const parsed = parseReminder(match[1]);
    if (!parsed) {
      return "Wann soll ich dich erinnern? Sag zum Beispiel: Erinnere mich um 18 Uhr ans Training.";
    }
    const all = JarvisMemory.getReminders();
    all.push({ text: parsed.text, time: parsed.time, done: false });
    JarvisMemory.saveReminders(all);
    renderReminders();
    return `Alles klar, ich erinnere dich ${formatTime(parsed.time)} an: ${parsed.text}. Lass die App dafür bitte geöffnet.`;
  }

  if (/(meine erinnerungen|welche erinnerungen|erinnerungen vorlesen|^erinnerungen$)/.test(text)) {
    return readReminders();
  }

  // ---------- To-dos ----------

  if (text.includes("aufgaben löschen") || text.includes("aufgaben leeren") || text.includes("alle aufgaben entfernen")) {
    JarvisMemory.saveTodos([]);
    renderTodos();
    return "Ich habe alle Aufgaben gelöscht.";
  }

  // Erledigt: "Mathe lernen ist erledigt" / "Erledigt: Mathe lernen" / "Hake Mathe lernen ab"
  match =
    rawText.match(/^(?:erledigt|aufgabe erledigt|abhaken)\s*:?\s+(.+)$/i) ||
    rawText.match(/^hake?\s+(.+?)\s+ab$/i) ||
    rawText.match(/^(?:streiche|streich|lösche|entferne)\s+(.+?)\s+(?:von|aus)\s+(?:den|der)\s+(?:aufgaben|aufgabenliste|to-?do-?liste)$/i) ||
    rawText.match(/^(.+?)\s+(?:ist|sind|habe ich)?\s*erledigt$/i);

  if (match) {
    const item = cleanItem(match[1]);
    if (completeTodo(item)) {
      return `Sehr gut! ${item} ist erledigt.`;
    }
    return `${item} habe ich nicht auf deiner Aufgabenliste gefunden.`;
  }

  // Hinzufügen: "Aufgabe: Mathe lernen" / "Neue Aufgabe Wäsche waschen" / "Setze Mathe lernen auf die Aufgabenliste"
  match =
    rawText.match(/^(?:neue\s+aufgabe|aufgabe|to-?do)\s*:?\s+(.+)$/i) ||
    rawText.match(/^(?:setze|setzte|setz|schreibe|schreib|füge|füg|pack|packe)\s+(.+?)\s+(?:auf\s+die|zur|zu\s+den|in\s+die)\s+(?:aufgaben|aufgabenliste|to-?do-?liste)(?:\s+hinzu)?$/i);

  if (match) {
    const rest = match[1].trim();
    if (/^(vorlesen|lesen|zeigen|anzeigen|liste)$/i.test(rest)) {
      return readTodos();
    }
    const added = addTodo(rest);
    if (added === null) return "Welche Aufgabe soll ich notieren?";
    if (added === "") return "Diese Aufgabe steht schon auf deiner Liste.";
    return `Ich habe die Aufgabe ${added} hinzugefügt.`;
  }

  if (/(meine aufgaben|welche aufgaben|offene aufgaben|aufgaben vorlesen|aufgabenliste|^aufgaben$|to-?do|was muss ich heute|was steht heute an)/.test(text)) {
    return readTodos();
  }

  // ---------- Allgemein ----------

  if (/(wie spät|uhrzeit|wie viel uhr|wieviel uhr|welche zeit)/.test(text) || text === "uhr" || text === "zeit") {
    const time = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `Es ist aktuell ${time} Uhr.`;
  }

  if (/(welches datum|datum heute|^datum$|welcher tag ist|heute für ein tag|den wievielten)/.test(text)) {
    const date = now.toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    return `Heute ist ${date}.`;
  }

  if (/^(hallo|hi|hey|guten morgen|guten tag|guten abend)( jarvis)?$/.test(text)) {
    return "Hallo! Alle Systeme sind bereit. Wie kann ich dir helfen?";
  }

  if (/^(wie geht es dir|wie gehts|wie geht's|status|systemstatus)$/.test(text)) {
    return "Alle Systeme laufen einwandfrei. Ich bin bereit für deine Befehle.";
  }

  if (text.includes("wetter")) {
    return "Für Live-Wetterdaten brauche ich noch eine Wetter-Schnittstelle.";
  }

  if (text.includes("neues gespräch") || text.includes("gespräch zurücksetzen") || text.includes("vergiss das gespräch")) {
    aiHistory = [];
    return "In Ordnung, wir fangen ein neues Gespräch an.";
  }

  if (text === "hilfe" || text.includes("was kannst du")) {
    return "Ich kann Uhrzeit und Datum sagen, Notizen, Einkaufsliste und Aufgaben führen und dich erinnern. Zum Beispiel: Aufgabe Mathe lernen, oder: Erinnere mich in 10 Minuten an den Herd. Alles andere kannst du mich einfach fragen.";
  }

  // Kein fester Befehl erkannt -> die KI antwortet
  return null;
}

function processInput(rawText) {
  const parsed = extractCommandWithWakeWord(rawText);

  if (parsed.onlyWake) {
    setReply("Ja, ich bin da. Was kann ich für dich tun?", true);
    return;
  }

  const finalText = parsed.cleanedText;
  if (!finalText) return;

  command.value = "";
  const answer = generateReply(finalText);

  if (answer !== null) {
    setReply(answer, true);
    return;
  }

  setReply("Einen Moment, ich denke nach ...", false);
  askAI(finalText).then(aiAnswer => setReply(aiAnswer, true));
}

function sendMessage() {
  const text = command.value.trim();
  if (!text) return;
  processInput(text);
}

function startVoiceRecognition(silentStart = false) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!Recognition) {
    setReply("Spracheingabe wird in diesem Browser nicht unterstützt.", false);
    return;
  }

  if (isRecognizing) return;

  const recognition = new Recognition();
  currentRecognition = recognition;
  recognition.lang = "de-DE";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecognizing = true;
    if (!silentStart) {
      setReply("Ich höre zu ...", false);
    }
  };

  recognition.onresult = event => {
    const spokenText = event.results[0][0].transcript.trim();
    command.value = spokenText;
    processInput(spokenText);
  };

  recognition.onerror = () => {
    isRecognizing = false;
    setReply("Spracheingabe konnte nicht gestartet werden.", false);
  };

  recognition.onend = () => {
    isRecognizing = false;
    currentRecognition = null;
  };

  recognition.start();
}

function stopVoiceRecognition() {
  if (currentRecognition) {
    currentRecognition.stop();
  }
  window.speechSynthesis && window.speechSynthesis.cancel();
}

document.getElementById("send").addEventListener("click", sendMessage);

command.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("remember").addEventListener("click", () => {
  const text = command.value.trim();

  if (!text) {
    setReply("Bitte gib zuerst eine Notiz ein.", true);
    return;
  }

  JarvisMemory.addNote(text);
  renderNotes();
  command.value = "";
  setReply("Notiz wurde gespeichert.", true);
});

// KI-Schlüssel eingeben (wird nur auf diesem Gerät gespeichert)
const aiKeyButton = document.getElementById("ai-key");
if (aiKeyButton) {
  aiKeyButton.addEventListener("click", () => {
    const current = JarvisMemory.getAiKey();
    const input = window.prompt(
      current
        ? "KI-Schlüssel ist gespeichert. Neuen Schlüssel einfügen oder Feld leeren zum Löschen:"
        : "Füge hier deinen Gemini-Schlüssel aus Google AI Studio ein:",
      ""
    );
    if (input === null) return; // abgebrochen

    const key = input.trim();
    JarvisMemory.saveAiKey(key);
    workingModel = null;
    setReply(key ? "KI-Schlüssel gespeichert. Du kannst mich jetzt alles fragen." : "KI-Schlüssel gelöscht.", true);
  });
}

// Mikrofon-Knopf: 1x tippen = Weiterhören an, nochmal tippen = aus
document.getElementById("voice").addEventListener("click", () => {
  keepListening = !keepListening;

  if (keepListening) {
    startVoiceRecognition(false);
  } else {
    stopVoiceRecognition();
    setReply("Zuhören beendet.", false);
  }
});

renderNotes();
renderShoppingList();
renderTodos();
renderReminders();

checkReminders(true);
setInterval(() => checkReminders(false), 10000);
