const command = document.getElementById("command");
const reply = document.getElementById("reply");
const notes = document.getElementById("notes");
const shoppingListEl = document.getElementById("shopping-list");

const wakeWord = "jarvis";

let keepListening = false;
let isRecognizing = false;
let currentRecognition = null;

// Zentrales Gedächtnis-Modul (aktuell lokal, später 1:1 durch MacBook-Sync austauschbar)
const JarvisMemory = {
  keys: {
    notes: "jarvis_notes",
    shopping: "jarvis_shopping_list"
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
    .map(part => stripPunctuation(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const current = JarvisMemory.getShoppingList();
  const added = [];

  parts.forEach(item => {
    const exists = current.some(existing => existing.toLowerCase() === item.toLowerCase());
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
  const cleanedTarget = stripPunctuation(targetItem).toLowerCase();
  const current = JarvisMemory.getShoppingList();
  const remaining = current.filter(item => item.toLowerCase() !== cleanedTarget);

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
  return `Auf deiner Einkaufsliste stehen ${items.length} Einträge: ${items.join(", ")}.`;
}

function generateReply(inputText) {
  const rawText = stripPunctuation(inputText);
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

  if (text.includes("notizen") || text.includes("was steht auf meiner liste")) {
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
    const itemToRemove = stripPunctuation(match[1] || "");
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
    rawText.match(/^(?:setze|setz|schreibe|schreib|pack|packe)\s+(.+?)\s+auf\s+die\s+einkaufsliste$/i) ||
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

  // ---------- Allgemein ----------

  if (text.includes("uhr") || text.includes("spät") || text.includes("zeit")) {
    const time = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `Es ist aktuell ${time} Uhr.`;
  }

  if (text.includes("datum") || text.includes("welcher tag") || text.includes("heute für ein tag")) {
    const date = now.toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    return `Heute ist ${date}.`;
  }

  if (text.includes("hallo") || text.startsWith("hi ") || text === "hi" || text.includes("guten morgen") || text.includes("guten abend")) {
    return "Hallo! Alle Systeme sind bereit. Wie kann ich dir helfen?";
  }

  if (text.includes("wie geht es") || text.includes("status")) {
    return "Alle Systeme laufen einwandfrei. Ich bin bereit für deine Befehle.";
  }

  if (text.includes("wetter")) {
    return "Für Live-Wetterdaten brauche ich noch eine Wetter-Schnittstelle.";
  }

  if (text.includes("hilfe") || text.includes("was kannst du")) {
    return "Du kannst mich nach Uhrzeit, Datum, Notizen oder deiner Einkaufsliste fragen. Zum Beispiel: Setze Milch auf die Einkaufsliste.";
  }

  return `Befehl empfangen: ${rawText}.`;
}

function processInput(rawText) {
  const parsed = extractCommandWithWakeWord(rawText);

  if (parsed.onlyWake) {
    setReply("Ja, ich bin da. Was kann ich für dich tun?", true);
    return;
  }

  const finalText = parsed.cleanedText;
  if (!finalText) return;

  const answer = generateReply(finalText);
  command.value = "";
  setReply(answer, true);
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
