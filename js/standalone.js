// Runs before the page draws: on an iPhone home-screen app, lets the CSS leave room for the status bar.
if (navigator.standalone) document.documentElement.classList.add("standalone");
