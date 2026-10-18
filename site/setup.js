// Client-side only. The part of the address after "#" never leaves this browser,
// and this page sends nothing anywhere.
(function () {
  var HELP = {
    anthropic: "https://console.anthropic.com/settings/keys",
    openai: "https://platform.openai.com/api-keys",
    google: "https://aistudio.google.com/apikey",
    mistral: "https://console.mistral.ai/api-keys",
    openrouter: "https://openrouter.ai/settings/keys",
    deepseek: "https://platform.deepseek.com/api_keys",
  };
  var BASE = location.origin + location.pathname;
  var $ = function (id) { return document.getElementById(id); };

  function b64url(s) {
    var bytes = new TextEncoder().encode(s), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function showHelp() { $("keyHelp").href = HELP[$("provider").value]; }
  $("provider").addEventListener("change", showHelp);
  showHelp();

  var link = "";
  function make() {
    var key = $("key").value.trim(), limit = Number($("limit").value);
    var out = $("out");
    out.hidden = false;
    if (key.length < 8 || /\s/.test(key) || !(limit >= 0 && limit <= 1000)) {
      out.textContent = "Please check the key and the limit.";
      link = "";
      return;
    }
    var cfg = { v: 1, provider: $("provider").value, apiKey: key, language: $("language").value, mode: $("mode").value, monthlyLimit: limit, currency: $("currency").value };
    var name = $("name").value.trim();
    if (name) cfg.name = name;
    link = BASE + "#lt=" + b64url(JSON.stringify(cfg));
    out.textContent = link;
  }
  $("make").addEventListener("click", make);
  $("copy").addEventListener("click", function () {
    if (!link) make();
    if (!link) return;
    navigator.clipboard.writeText(link).then(function () { $("msg").textContent = "Copied."; }, function () { $("msg").textContent = "Could not copy. Select the link and copy it."; });
  });

  // Arrived via the email link: the extension (if installed) moves this tab away at once.
  if (location.hash.indexOf("#lt=") === 0) {
    $("opening").hidden = false;
    setTimeout(function () { $("notinstalled").hidden = false; }, 2000);
  }
})();
