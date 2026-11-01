(function () {
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) nav.classList.remove("open");
    });
  }

  function fillBars(root) {
    root.querySelectorAll(".bar i[data-w]").forEach(function (b) { b.style.width = b.dataset.w; });
  }
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("in");
        fillBars(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); fillBars(el); });
  }

  // Code tabs with copy.
  document.querySelectorAll("[data-tabs]").forEach(function (box) {
    var tabs = box.querySelectorAll("[data-tab]");
    var panels = box.querySelectorAll("[data-panel]");
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (x) { x.setAttribute("aria-selected", String(x === t)); });
        panels.forEach(function (p) { p.hidden = p.dataset.panel !== t.dataset.tab; });
      });
    });
    var copy = box.querySelector("[data-copy]");
    if (copy) copy.addEventListener("click", function () {
      var visible = box.querySelector("[data-panel]:not([hidden])");
      navigator.clipboard.writeText(visible.innerText).then(function () {
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = "Copy"; }, 1500);
      });
    });
  });

  // Hero terminal: install once, then type requests and print what Keystone answered.
  var term = document.querySelector("[data-terminal]");
  if (term) {
    var version = "1.4.0";
    var install = {
      cmd: "curl -fsSL https://ai-process.dev/install.sh | sh",
      out: [
        "==> Checking Docker",
        "Keystone {v}, files in ~/ktms",
        "Paste an OpenAI, Anthropic or Gemini API key: ••••••••",
        "",
        "==> Starting Keystone, Postgres and Redis",
        ' <span class="ok">✔</span> keystone-db-1     Healthy',
        ' <span class="ok">✔</span> keystone-ktms-1   Started',
        "",
        '<span class="ok">Keystone is running on http://localhost:8080</span>',
        '<span class="c"># about 10 seconds with the images cached</span>'
      ]
    };
    var request = function (model) {
      return "curl localhost:8080/v1/chat/completions \\\n" +
        '    -H "Authorization: Bearer ktms_local_…" \\\n' +
        "    -d '{\"model\":\"" + model + "\",\"messages\":[…]}'";
    };
    var scenes = [
      {
        cmd: request("auto:high"),
        out: [
          '<span class="ok">HTTP/1.1 200 OK</span>',
          '<span class="h">X-KTMS-Vendor:</span> anthropic',
          '<span class="h">X-KTMS-Rule:</span> default-high',
          '<span class="h">X-KTMS-Placement:</span> cloud_first',
          '{"choices":[{"message":{"content":"Here is the plan…"}}]}',
          '<span class="c"># effort HIGH → strongest model in the chain</span>'
        ]
      },
      {
        cmd: request("auto:low"),
        out: [
          '<span class="ok">HTTP/1.1 200 OK</span>',
          '<span class="h">X-KTMS-Vendor:</span> local',
          '<span class="h">X-KTMS-Rule:</span> cheap-and-fast',
          '<span class="h">X-KTMS-Placement:</span> nodes_first',
          '{"choices":[{"message":{"content":"Sure, done."}}]}',
          '<span class="c"># served by gpu-02 (Ollama): zero cloud tokens</span>'
        ]
      },
      {
        cmd: request("auto:medium"),
        out: [
          '<span class="ok">HTTP/1.1 200 OK</span>',
          '<span class="h">X-KTMS-Vendor:</span> gemini',
          '<span class="h">X-KTMS-Rule:</span> default-medium',
          '<span class="h">X-KTMS-Placement:</span> cloud_first',
          '{"choices":[{"message":{"content":"Summary: …"}}]}',
          '<span class="c"># first vendor returned 503 → fell back, caller never noticed</span>'
        ]
      }
    ];
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var esc = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var head = '<span class="p">$</span> ';

    var show = async function (s, fast) {
      for (var c = 0; c <= s.cmd.length; c++) {
        term.innerHTML = head + esc(s.cmd.slice(0, c)) + '<span class="cursor"></span>';
        await wait(s.cmd[c - 1] === "\n" ? 120 : 18 + Math.random() * 22);
      }
      await wait(380);
      var shown = head + esc(s.cmd) + "\n\n";
      for (var l = 0; l < s.out.length; l++) {
        shown += s.out[l].replace("{v}", version) + "\n";
        term.innerHTML = shown + '<span class="cursor"></span>';
        await wait(fast ? (l === 0 ? 260 : 110) : (l === 4 ? 900 : 330));
      }
      await wait(3200);
    };

    var play = async function () {
      if (reduced) {
        term.innerHTML = head + esc(install.cmd) + "\n\n" + install.out.join("\n").replace("{v}", version);
        return;
      }
      await show(install, false);
      for (var i = 0; ; i = (i + 1) % scenes.length) await show(scenes[i], true);
    };
    if (window.fetch) {
      fetch("https://api.github.com/repos/ai-process/ktms/releases/latest").then(function (r) {
        return r.ok ? r.json() : null;
      }).then(function (j) {
        if (j && j.tag_name) version = j.tag_name.replace(/^v/, "");
      }).catch(function () {});
    }
    play();
  }

  // Install box: switch between ways to install and copy the command.
  var inst = document.querySelector("[data-install]");
  if (inst) {
    var cmdEl = inst.querySelector("[data-install-cmd]");
    var labelEl = inst.querySelector("[data-install-label]");
    var ways = inst.querySelectorAll("button[data-cmd]");
    ways.forEach(function (b) {
      b.addEventListener("click", function () {
        ways.forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        cmdEl.textContent = b.dataset.cmd;
        labelEl.textContent = b.dataset.label;
      });
    });
    var copyBtn = inst.querySelector("[data-install-copy]");
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(cmdEl.textContent).then(function () {
        copyBtn.textContent = "Copied";
        setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
        if (window.gtag) window.gtag("event", "copy_install_command", { method: cmdEl.textContent.split(" ")[0] });
      });
    });
  }

  // Latest posts from the blog feed; the card works without them.
  var list = document.querySelector("[data-blog-posts]");
  if (list && window.fetch && window.DOMParser) {
    fetch("https://blog.ai-process.dev/feed.xml").then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      var entries = Array.prototype.slice.call(doc.querySelectorAll("entry"), 0, 3);
      entries.forEach(function (e) {
        var link = e.querySelector("link");
        var li = document.createElement("li");
        var time = document.createElement("time");
        time.textContent = (e.querySelector("published") || {}).textContent.slice(0, 10);
        var a = document.createElement("a");
        a.href = link.getAttribute("href");
        a.textContent = e.querySelector("title").textContent;
        li.append(time, a);
        list.append(li);
      });
      if (entries.length) list.hidden = false;
    }).catch(function () {});
  }
})();
