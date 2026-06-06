async function aiSearch() {

  const question =
  document.getElementById(
  "timelineSearch"
  ).value.trim();

  if(!question){
    return;
  }

  const chatContainer =
  document.getElementById(
  "chatContainer"
  );

  chatContainer.innerHTML += `
  <div class="user-message">
  ${question}
  </div>
  `;

  document
  .getElementById(
  "timelineSearch"
  )
  .value = "";

  // Loading indicator
  const loadingId = "loading-" + Date.now();
  chatContainer.innerHTML += `
  <div class="ai-message" id="${loadingId}">
    <span style="color:#666;">Searching archive...</span>
  </div>
  `;
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {

    const response =
    await fetch(
      "/ai-search",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({ question })
      }
    );

    const data = await response.json();

    // Remove loading indicator
    const loadingEl = document.getElementById(loadingId);
    if(loadingEl) loadingEl.remove();

    // Render markdown properly
    const rendered = marked.parse(data.answer || "No response received.");

    chatContainer.innerHTML += `
    <div class="ai-message">
      <strong>AI Investigation Answer</strong>
      <br><br>
      ${rendered}
    </div>
    `;

    chatContainer.scrollTop = chatContainer.scrollHeight;

  } catch(error){

    console.log(error);

    const loadingEl = document.getElementById(loadingId);
    if(loadingEl) loadingEl.remove();

    chatContainer.innerHTML += `
    <div class="ai-message">
      AI connection failed.
    </div>
    `;

  }

}

function quickAsk(question){
  document
  .getElementById("timelineSearch")
  .value = question;
  aiSearch();
}

document
.getElementById("timelineSearch")
.addEventListener("keypress", function(event){
  if(event.key === "Enter"){
    aiSearch();
  }
});