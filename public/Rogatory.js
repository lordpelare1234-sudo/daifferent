async function rogatorySearch() {

  const input = document.getElementById("rogatorySearch");
  const question = input.value.trim();

  if (!question) return;

  // Get or create chat container
  let chatContainer = document.getElementById("chatContainer");
  if (!chatContainer) {
    const aiAnswer = document.getElementById("aiAnswer");
    aiAnswer.innerHTML = `<div id="chatContainer" class="chat-container"></div>`;
    chatContainer = document.getElementById("chatContainer");
  }

  // Add user message
  chatContainer.innerHTML += `
    <div class="user-message">
      ${question}
    </div>
  `;

  input.value = "";
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Loading bubble
  const loadingId = "loading-" + Date.now();
  chatContainer.innerHTML += `
    <div class="ai-message" id="${loadingId}">
      <span style="color:#666;">Searching rogatory interviews...</span>
    </div>
  `;
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {

    const response = await fetch("/rogatory-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    const data = await response.json();

    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    chatContainer.innerHTML += `
      <div class="ai-message">
        <strong>Rogatory AI</strong>
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
        Rogatory AI failed. Please try again.
      </div>
    `;

    console.error(error);
  }

}

function quickRogatory(question) {
  document.getElementById("rogatorySearch").value = question;
  rogatorySearch();
}

document.getElementById("rogatorySearch")
  .addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      rogatorySearch();
    }
  });