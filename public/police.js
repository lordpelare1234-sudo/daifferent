
async function policeSearch() {

  const question =
  document.getElementById(
    "policeSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Police AI
      </h2>

      <p>
        Analyzing police records...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/police-search",

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
          Police Analysis
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
          Police AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickPolice(question) {

  document.getElementById(
    "policeSearch"
  ).value =
  question;

  policeSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickPolice(
        card.innerText.trim()
      );

    }
  );

});

