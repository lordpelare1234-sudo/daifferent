
async function phoneSearch() {

  const question =
  document.getElementById(
    "phoneSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Phone Records AI
      </h2>

      <p>
        Analyzing phone records...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/phone-search",

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
          Phone Records Analysis
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
          Phone Records AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickPhone(question) {

  document.getElementById(
    "phoneSearch"
  ).value =
  question;

  phoneSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickPhone(
        card.innerText.trim()
      );

    }
  );

});

