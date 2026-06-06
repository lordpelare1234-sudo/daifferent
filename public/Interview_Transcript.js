async function transcriptSearch() {

  const input = document.getElementById("transcriptSearch");
  const question = input.value.trim();

  if (!question) return;

  let chatContainer = document.getElementById("chatContainer");
  if (!chatContainer) {
    const aiAnswer = document.getElementById("aiAnswer");
    aiAnswer.innerHTML = `<div id="chatContainer" class="chat-container"></div>`;
    chatContainer = document.getElementById("chatContainer");
  }

  chatContainer.innerHTML += `
    <div class="user-message">
      ${question}
    </div>
  `;

  input.value = "";
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const loadingId = "loading-" + Date.now();
  chatContainer.innerHTML += `
    <div class="ai-message" id="${loadingId}">
      <span style="color:#666;">Searching interview transcripts...</span>
    </div>
  `;
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {

    const response = await fetch("/transcript-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    const data = await response.json();

    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    chatContainer.innerHTML += `
      <div class="ai-message">
        <strong>Transcript AI</strong>
        <br><br>
        ${marked.parse(data.answer || "No response received.")}
      </div>
    `;

    chatContainer.scrollTop = chatContainer.scrollHeight;

  } catch (error) {

    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    chatContainer.innerHTML += `
      <div class="ai-message">
        Transcript AI failed. Please try again.
      </div>
    `;

    console.error(error);
  }

}

function quickTranscript(question) {
  document.getElementById("transcriptSearch").value = question;
  transcriptSearch();
}

document.getElementById("transcriptSearch")
  .addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      transcriptSearch();
    }
  });