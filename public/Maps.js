
async function mapsSearch() {

  const question =
  document.getElementById(
    "mapsSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `

    <div class="timeline-event">

      <h2>
        Maps AI
      </h2>

      <p>
        Analyzing locations and maps...
      </p>

    </div>

  `;

  try {

    const response =
    await fetch(

      "/maps-search",

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
          Maps Analysis
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
          Maps AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}

function quickMaps(question) {

  document.getElementById(
    "mapsSearch"
  ).value =
  question;

  mapsSearch();

}

document
.querySelectorAll(".question-card")
.forEach(card => {

  card.addEventListener(
    "click",
    () => {

      quickMaps(
        card.innerText.trim()
      );

    }
  );

});

