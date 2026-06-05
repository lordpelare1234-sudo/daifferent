
async function theoriesSearch() {

  const question =
  document.getElementById(
    "theoriesSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Theories AI
      </h2>

      <p>
        Analyzing theories...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/theories-search",

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
          Theory Analysis
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
          Theories AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickTheory(question) {

  document.getElementById(
    "theoriesSearch"
  ).value =
  question;

  theoriesSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickTheory(
        card.innerText.trim()
      );

    }
  );

});

