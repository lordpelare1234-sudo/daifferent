
if(data.success){

  const me =

  await fetch("/me");

  const user =

  await me.json();

  if(

    user.user.role ===

    "admin"

  ){

    window.location.href =

    "/dashboard.html";

  }

  else{

    window.location.href =

    "/index.html";

  }

}
