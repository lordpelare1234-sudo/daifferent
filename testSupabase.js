
const supabase =
require("./supabase");

async function test() {

  const {
    data,
    error
  } =
  await supabase.auth.admin.listUsers();

  if(error){

    console.log(error);

  } else {

    console.log(
      "CONNECTED!"
    );

    console.log(data);

  }

}

test();

