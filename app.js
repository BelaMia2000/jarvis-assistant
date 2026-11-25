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
  notes.innerHTML
