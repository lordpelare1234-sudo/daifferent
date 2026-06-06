async function policeSearch() {

  const input = document.getElementById("policeSearch");
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
      <span style="color:#666;">Searching police records...</span>
    </div>
  `;
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {

    const response = await fetch("/police-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    const data = await response.json();

    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    chatContainer.innerHTML += `
      <div class="ai-message">
        <strong>Police AI</strong>
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
        Police AI failed. Please try again.
      </div>
    `;

    console.error(error);
  }

}

function quickPolice(question) {
  document.getElementById("policeSearch").value = question;
  policeSearch();
}

document.getElementById("policeSearch")
  .addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      policeSearch();
    }
  });