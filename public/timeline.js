
async function timelineSearch() {

  const question =
  document.getElementById(
    "timelineSearch"
  ).value;

  const aiAnswer =
  document.getElementById(
    "aiAnswer"
  );

  aiAnswer.innerHTML = `
    <div class="timeline-event">
      <h2>Timeline AI</h2>
      <p>Analyzing timeline...</p>
    </div>
  `;

  try {

    const response =
    await fetch(

      "/timeline-search",

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
          Timeline Analysis
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
          Timeline AI failed.
        </p>

      </div>

    `;

    console.error(error);

  }

}



function quickTimeline(question) {

  document.getElementById(
    "timelineSearch"
  ).value =
  question;

  timelineSearch();

}

