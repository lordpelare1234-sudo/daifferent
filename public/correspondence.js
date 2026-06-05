
async function correspondenceSearch() {

  const question =
  document.getElementById(
    "correspondenceSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Correspondence AI
      </h2>

      <p>
        Analyzing correspondence...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/correspondence-search",

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
          Correspondence Analysis
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
          Correspondence AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickCorrespondence(question) {

  document.getElementById(
    "correspondenceSearch"
  ).value =
  question;

  correspondenceSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickCorrespondence(
        card.innerText.trim()
      );

    }
  );

});

