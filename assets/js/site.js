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

  // Hero terminal: type a request, then print what KTMS answered.
  var term = document.querySelector("[data-terminal]");
  if (term) {
    var scenes = [
      {
        model: "auto:high",
        out: [
          '<span class="ok">HTTP/1.1 200 OK</span>',
          '<span class="h">X-KTMS-Vendor:</span> anthropic',
          '<span class="h">X-KTMS-Rule:</span> hard-reasoning',
          '<span class="h">X-KTMS-Placement:</span> cloud_first',
          '{"choices":[{"message":{"content":"Here is the plan…"}}]}',
          '<span class="c"># effort HIGH → strongest model in the chain</span>'
        ]
      },
      {
        model: "auto:low",
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
        model: "auto:medium",
        out: [
          '<span class="ok">HTTP/1.1 200 OK</span>',
          '<span class="h">X-KTMS-Vendor:</span> gemini',
          '<span class="h">X-KTMS-Rule:</span> default',
          '<span class="h">X-KTMS-Placement:</span> cloud_first',
          '{"choices":[{"message":{"content":"Summary: …"}}]}',
          '<span class="c"># first vendor returned 503 → fell back, caller never noticed</span>'
        ]
      }
    ];
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cmd = function (model) {
      return "curl :8080/v1/chat/completions \\\n" +
        '    -H "Authorization: Bearer ktms_…" \\\n' +
        "    -d '{\"model\":\"" + model + "\",\"messages\":[…]}'";
    };
    var esc = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    var play = async function () {
      for (var i = 0; ; i = (i + 1) % scenes.length) {
        var s = scenes[i];
        var text = cmd(s.model);
        var head = '<span class="p">$</span> ';
        if (reduced) {
          term.innerHTML = head + esc(text) + "\n\n" + s.out.join("\n");
          return;
        }
        for (var c = 0; c <= text.length; c++) {
          term.innerHTML = head + esc(text.slice(0, c)) + '<span class="cursor"></span>';
          await wait(text[c - 1] === "\n" ? 120 : 18 + Math.random() * 22);
        }
        await wait(380);
        var shown = head + esc(text) + "\n\n";
        for (var l = 0; l < s.out.length; l++) {
          shown += s.out[l] + "\n";
          term.innerHTML = shown + '<span class="cursor"></span>';
          await wait(l === 0 ? 260 : 110);
        }
        await wait(3200);
      }
    };
    play();
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
