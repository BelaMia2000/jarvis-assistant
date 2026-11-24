const command = document.getElementById("command");
const reply = document.getElementById("reply");
const notes = document.getElementById("notes");

const storageKey = "jarvis_notes";

function getSavedNotes() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch (error) {
    return [];
  }
}

function saveNoteText(noteText) {
  const saved = getSavedNotes();
  saved.push(noteText);
  localStorage.setItem(storageKey, JSON.stringify(saved));
  loadNotes();
}

function loadNotes() {
  const saved = getSavedNotes();
  notes.innerHTML = "";

  saved.forEach(note => {
    const li = document.createElement("li");
    li.textContent = note;
    notes.appendChild(li);
  });
}

function generateReply(rawText) {
  const text = rawText.toLowerCase();
  const now = new Date();

  if (text.includes("uhr") || text.includes("spät") || text.includes("zeit")) {
    const time = now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit"
    });
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

  if (text.startsWith("notiz:") || text.startsWith("notiz ") || text.startsWith("merke dir ")) {
    const cleaned = rawText
      .replace(/^(notiz:|notiz|merke dir)\s*/i, "")
      .trim();

    if (!cleaned) {
      return "Was genau soll ich mir notieren?";
    }

    saveNoteText(cleaned);
    return `Alles klar, ich habe mir notiert: „${cleaned}“.`;
  }

  if (text.includes("notizen") || text.includes("was steht auf meiner liste")) {
    const saved = getSavedNotes();
    if (saved.length === 0) {
      return "Du hast aktuell noch keine Notizen gespeichert.";
    }
    return `Du hast ${saved.length} Notiz(en): ${saved.join(", ")}.`;
  }

  if (text.includes("notizen löschen") || text.includes("alle notizen entfernen")) {
    localStorage.removeItem(storageKey);
    loadNotes();
    return "Ich habe alle gespeicherten Notizen gelöscht.";
  }

  if (text.includes("hallo") || text.includes("hi ") || text === "hi" || text.includes("guten morgen") || text.includes("guten abend")) {
    return "Hallo! Alle Systeme sind bereit. Wie kann ich dir helfen?";
  }

  if (text.includes("wie geht es") || text.includes("status")) {
    return "Alle Systeme laufen einwandfrei. Ich bin bereit für deine Befehle.";
  }

  if (text.includes("wetter")) {
    return "Für Live-Wetterdaten brauche ich noch eine Wetter-Schnittstelle – sag mir gern, wenn wir das als Nächstes einbauen sollen.";
  }

  if (text.includes("hilfe") || text.includes("was kannst du")) {
    return "Du kannst mich nach Uhrzeit, Datum oder deinen Notizen fragen – oder sagen: „Notiz: Einkaufen“ bzw. „Notizen löschen“.";
  }

  return `Befehl empfangen: „${rawText}“. Frag mich nach „Hilfe“, um alle Befehle zu sehen.`;
}

function sendMessage() {
  const text = command.value.trim();

  if (!text) return;

  reply.textContent = generateReply(text);
  command.value = "";
}

document.getElementById("send")
  .addEventListener("click", sendMessage);

command.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("remember")
  .addEventListener("click", () => {
    const text = command.value.trim();

    if (!text) {
      reply.textContent = "Bitte gib zuerst eine Notiz ein.";
      return;
    }

    saveNoteText(text);
    command.value = "";
    reply.textContent = "Notiz wurde gespeichert.";
  });

document.getElementById("voice")
  .addEventListener("click", () => {
    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      reply.textContent =
        "Spracheingabe wird in diesem Browser nicht unterstützt.";
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "de-DE";

    recognition.onresult = event => {
      command.value = event.results[0][0].transcript;
    };

    recognition.onerror = () => {
      reply.textContent =
        "Spracheingabe konnte nicht gestartet werden.";
    };

    recognition.start();
    reply.textContent = "Ich höre zu ...";
  });

loadNotes();
