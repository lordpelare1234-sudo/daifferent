async function witnessSearch() {

  const input = document.getElementById("witnessSearch");
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
      <span style="color:#666;">Searching witness statements...</span>
    </div>
  `;
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {

    const response = await fetch("/witness-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    const data = await response.json();

    // Remove loading bubble
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    // Add AI response
    chatContainer.innerHTML += `
      <div class="ai-message">
        <strong>Witness AI</strong>
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
        Witness AI failed. Please try again.
      </div>
    `;

    console.error(error);
  }

}

function quickWitness(question) {
  document.getElementById("witnessSearch").value = question;
  witnessSearch();
}

document.getElementById("witnessSearch")
  .addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      witnessSearch();
    }
  });