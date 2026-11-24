const command = document.getElementById("command");
const reply = document.getElementById("reply");
const notes = document.getElementById("notes");

const storageKey = "jarvis_notes";

function loadNotes() {
  let saved = [];

  try {
    saved = JSON.parse(
      localStorage.getItem(storageKey) || "[]"
    );
  } catch (error) {
    saved = [];
  }

  notes.innerHTML = "";

  saved.forEach(note => {
    const li = document.createElement("li");
    li.textContent = note;
    notes.appendChild(li);
  });
}

function sendMessage() {
  const text = command.value.trim();

  if (!text) return;

  reply.textContent =
    "Nachricht empfangen: " + text;

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
      reply.textContent =
        "Bitte gib zuerst eine Notiz ein.";
      return;
    }

    let saved = [];

    try {
      saved = JSON.parse(
        localStorage.getItem(storageKey) || "[]"
      );
    } catch (error) {
      saved = [];
    }

    saved.push(text);

    localStorage.setItem(
      storageKey,
      JSON.stringify(saved)
    );

    command.value = "";
    loadNotes();

    reply.textContent =
      "Notiz wurde gespeichert.";
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
      command.value =
        event.results[0][0].transcript;
    };

    recognition.onerror = () => {
      reply.textContent =
        "Spracheingabe konnte nicht gestartet werden.";
    };

    recognition.start();
    reply.textContent = "Ich höre zu ...";
  });

loadNotes();
