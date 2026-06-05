
async function rogatorySearch() {

  const question =
  document.getElementById(
    "rogatorySearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Rogatory AI
      </h2>

      <p>
        Analyzing rogatory interviews...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/rogatory-search",

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
          Rogatory Analysis
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
          Rogatory AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickRogatory(question) {

  document.getElementById(
    "rogatorySearch"
  ).value =
  question;

  rogatorySearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickRogatory(
        card.innerText.trim()
      );

    }
  );

});

