
async function photographSearch() {

  const question =
  document.getElementById(
    "photographSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Photograph AI
      </h2>

      <p>
        Analyzing photographs...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/photograph-search",

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
          Photograph Analysis
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
          Photograph AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickPhotograph(question) {

  document.getElementById(
    "photographSearch"
  ).value =
  question;

  photographSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickPhotograph(
        card.innerText.trim()
      );

    }
  );

});

