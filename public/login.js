async function login() {

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn      = document.getElementById("login-btn");
  const msg      = document.getElementById("message");

  if (!email || !password) {
    msg.style.color = "red";
    msg.innerText   = "Please enter your email and password.";
    return;
  }

  btn.disabled  = true;
  btn.innerText = "Logging in...";
  msg.innerText = "";

  try {

    const response = await fetch("/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });

    // If server returned non-JSON or crashed mid-response
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      msg.style.color = "red";
      msg.innerText   = `Server error (status ${response.status}). Check your server terminal.`;
      btn.disabled    = false;
      btn.innerText   = "Login";
      return;
    }

    if (data.success) {

      msg.style.color = "green";
      msg.innerText   = "Login successful. Redirecting...";

      setTimeout(() => {
        window.location.href = "/index.html";
      }, 800);

    } else {

      msg.style.color = "red";
      msg.innerText   = data.message || "Login failed. Please try again.";
      btn.disabled    = false;
      btn.innerText   = "Login";

    }

  } catch (err) {

    // This only fires if the fetch itself fails — server not reachable
    msg.style.color = "red";
    msg.innerText   = `Cannot reach server: ${err.message}. Is it running on port 5000?`;
    btn.disabled    = false;
    btn.innerText   = "Login";
    console.error("Login fetch error:", err);

  }

}