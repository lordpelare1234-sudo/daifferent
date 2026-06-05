async function transcriptSearch() {

  const question =
  document.getElementById(
    "transcriptSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Transcript AI
      </h2>

      <p>
        Analyzing interview transcripts...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/transcript-search",

      {

        method: "POST",

        headers: {

          "Content-Type":
          "application/json"

        },

        body: JSON.stringify({

          question

        })

      }

    );

    const data =
    await response.json();

    aiAnswer.innerHTML = `

      <div class="timeline-event">

        <h2>
          Transcript Analysis
        </h2>

        <p>
          ${data.answer}
        </p>

      </div>

    `;

  } catch (error) {

    aiAnswer.innerHTML = `

      <div class="timeline-event">

        <h2>
          Error
        </h2>

        <p>
          Transcript AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickTranscript(question) {

  document.getElementById(
    "transcriptSearch"
  ).value =
  question;

  transcriptSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickTranscript(
        card.innerText.trim()
      );

    }
  );

});