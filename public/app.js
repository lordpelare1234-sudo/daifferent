
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

  try {

    const response =

    await fetch(

      "/ai-search",

      {

        method:"POST",

        headers:{
          "Content-Type":
          "application/json"
        },

        body:JSON.stringify({

          question

        })

      }

    );

    const data =
    await response.json();

    chatContainer.innerHTML += `

    <div class="ai-message">

      <strong>
      AI Investigation Answer
      </strong>

      <br><br>

      ${data.answer}

    </div>

    `;

    chatContainer.scrollTop =
    chatContainer.scrollHeight;

  }

  catch(error){

    console.log(error);

    chatContainer.innerHTML += `

    <div class="ai-message">

      AI connection failed.

    </div>

    `;

  }

}

function quickAsk(question){

  document
  .getElementById(
  "timelineSearch"
  )
  .value = question;

  aiSearch();

}

document
.getElementById(
"timelineSearch"
)
.addEventListener(

"keypress",

function(event){

  if(event.key === "Enter"){

    aiSearch();

  }

}

);

