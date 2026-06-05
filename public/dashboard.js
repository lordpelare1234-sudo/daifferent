
async function checkAdmin() {

  try {

    const response =
    await fetch("/me");

    const data =
    await response.json();

    console.log(data);

    if (

      !data.authenticated ||

      !data.user ||

      data.user.role !== "admin"

    ) {

      alert(
        "Access denied"
      );

      window.location.href =
      "/index.html";

      return;

    }

    document
    .getElementById(
      "adminName"
    )
    .innerText =
    data.user.username;

  }

  catch(error){

    console.log(error);

    window.location.href =
    "/index.html";

  }

}

async function logout(){

  await fetch(

    "/logout",

    {

      method:"POST"

    }

  );

  window.location.href =
  "/login.html";

}

checkAdmin();

