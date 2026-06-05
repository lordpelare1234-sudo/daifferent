
async function forensicsSearch() {

  const question =
  document.getElementById(
    "forensicsSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Forensics AI
      </h2>

      <p>
        Analyzing forensic evidence...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/forensics-search",

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
          Forensics Analysis
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
          Forensics AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickForensics(question) {

  document.getElementById(
    "forensicsSearch"
  ).value =
  question;

  forensicsSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickForensics(
        card.innerText.trim()
      );

    }
  );

});

