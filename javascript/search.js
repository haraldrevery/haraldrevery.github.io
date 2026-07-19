/* SITE SEARCH — part 3 of 3 (see eleventy_settings/search.njk for the full map).
   Progressive enhancement for the [data-search] widget: reveals it, lazily
   fetches /search-index.json on first focus, and shows a live result dropdown.

   NOTE: /javascript/ is NOT scanned by the Tailwind build, so every class name
   used in this file must already exist in main.css (i.e. also be used in some
   scanned template). If you add new classes here, use them in markup too.

   To search MORE fields later: extend `hay` below and (if needed) the emitted
   fields in eleventy_njk/search-index.njk. */
(() => {
    if (window.__searchInit) return; // idempotent if the snippet is pasted twice
    window.__searchInit = true;

    let index = null;
    let loading = null;
    const load = () => loading ||= fetch("/search-index.json")
        .then((r) => r.json())
        .then((items) => {
            // Hardening: only accept well-formed items with same-site relative
            // URLs ("/...") — rules out javascript:/external hrefs even if the
            // index file were ever corrupted or tampered with.
            if (!Array.isArray(items)) items = [];
            // Precompute one lowercase "haystack" string per item.
            index = items
                .filter((it) => it && typeof it.title === "string" &&
                    typeof it.url === "string" && it.url.startsWith("/") && !it.url.startsWith("//"))
                .map((it) => ({
                    ...it,
                    hay: (it.title + " " + (it.description || "") + " " + (it.tags || []).join(" ")).toLowerCase(),
                }));
        })
        .catch(() => { index = []; });

    document.querySelectorAll("[data-search]").forEach((box, n) => {
        const input = box.querySelector("input");
        const list = box.querySelector("ul");
        if (!input || !list) return;
        box.removeAttribute("hidden"); // JS is running: reveal the widget
        list.id = "search-results-" + n;
        input.setAttribute("aria-controls", list.id);

        let results = [];
        let active = -1; // index of the keyboard-highlighted result
        let timer;

        const close = () => {
            list.hidden = true;
            list.textContent = "";
            input.setAttribute("aria-expanded", "false");
            input.removeAttribute("aria-activedescendant");
            active = -1;
        };

        const paint = () => list.querySelectorAll("a").forEach((a, i) => {
            a.classList.toggle("bg-neutral-300", i === active);
            a.classList.toggle("dark:bg-neutral-700", i === active);
            a.parentElement.setAttribute("aria-selected", i === active);
            if (i === active) {
                input.setAttribute("aria-activedescendant", a.parentElement.id);
                a.scrollIntoView({ block: "nearest" });
            }
        });

        const render = () => {
            list.textContent = "";
            active = -1;
            results.forEach((it, i) => {
                const li = document.createElement("li");
                li.setAttribute("role", "option");
                li.id = list.id + "-opt-" + i;
                const a = document.createElement("a");
                a.href = it.url;
                a.className = "block px-4 py-2 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors";
                const title = document.createElement("div");
                title.className = "text-neutral-900 dark:text-white truncate";
                title.textContent = it.title;
                const meta = document.createElement("div");
                meta.className = "text-xs text-neutral-500 font-mono uppercase tracking-widest";
                meta.textContent = it.type + (it.date ? " · " + it.date : "");
                a.append(title, meta);
                li.append(a);
                list.append(li);
            });
            list.hidden = !results.length;
            input.setAttribute("aria-expanded", String(!!results.length));
        };

        const run = () => {
            const q = input.value.trim().toLowerCase();
            if (!q || !index) return close();
            const toks = q.split(/\s+/);
            results = index
                .filter((it) => toks.every((t) => it.hay.includes(t)))
                .sort((a, b) => b.title.toLowerCase().includes(q) - a.title.toLowerCase().includes(q))
                .slice(0, 8);
            render();
        };

        input.addEventListener("focus", () => { load().then(run); }, { once: true });
        input.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => load().then(run), 120);
        });
        input.addEventListener("keydown", (e) => {
            if (list.hidden) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                active = (active + 1) % results.length;
                paint();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                active = (active - 1 + results.length) % results.length;
                paint();
            } else if (e.key === "Enter" && active >= 0) {
                e.preventDefault();
                location.href = results[active].url;
            } else if (e.key === "Escape") {
                close();
                input.blur();
            }
        });
        document.addEventListener("click", (e) => {
            if (!box.contains(e.target)) close();
        });
    });
})();
