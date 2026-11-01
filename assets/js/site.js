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

  // Demo terminal: type requests and print what Keystone answered.
  var term = document.querySelector("[data-terminal]");
  if (term) {
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
        shown += s.out[l] + "\n";
        term.innerHTML = shown + '<span class="cursor"></span>';
        await wait(fast ? (l === 0 ? 260 : 110) : (l === 4 ? 900 : 330));
      }
      await wait(3200);
    };

    var play = async function () {
      if (reduced) {
        term.innerHTML = head + esc(scenes[0].cmd) + "\n\n" + scenes[0].out.join("\n");
        return;
      }
      for (var i = 0; ; i = (i + 1) % scenes.length) await show(scenes[i], true);
    };
    // The demo sits below the fold: start typing when it comes into view.
    if ("IntersectionObserver" in window) {
      var started = false;
      new IntersectionObserver(function (entries, obs) {
        if (started || !entries[0].isIntersecting) return;
        started = true;
        obs.disconnect();
        play();
      }, { threshold: 0.3 }).observe(term);
    } else {
      play();
    }
  }

  // Install card: tabs switch the way to install; Copy takes the command without the prompt.
  var inst = document.querySelector("[data-install]");
  if (inst) {
    var tabs = inst.querySelectorAll("[data-way]");
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (x) { x.setAttribute("aria-selected", String(x === t)); });
        inst.querySelectorAll("[data-panel-way]").forEach(function (p) { p.hidden = p.dataset.panelWay !== t.dataset.way; });
      });
    });
  }
  document.querySelectorAll("[data-copy-cmd]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.parentNode.querySelector("code").textContent.replace(/^\$\s*/, "");
      navigator.clipboard.writeText(code).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1500);
        if (window.gtag) window.gtag("event", "copy_install_command", { method: code.split(" ")[0] });
      });
    });
  });

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
