
async function witnessSearch() {

  const question =
  document.getElementById(
    "witnessSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Witness AI
      </h2>

      <p>
        Analyzing witness statements...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/witness-search",

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
          Witness Analysis
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
          Witness AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickWitness(question) {

  document.getElementById(
    "witnessSearch"
  ).value =
  question;

  witnessSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickWitness(
        card.innerText.trim()
      );

    }
  );

});

