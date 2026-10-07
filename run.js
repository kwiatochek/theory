(() => {
    const WORKER_URL = "pyworker.js";
    const TIMEOUT_MS = 5000;
    const LABEL_RUN = "Запустить";
    const LABEL_LOADING = "Загрузка Python…";
    const LABEL_RUNNING = "Выполнение…";

    const blocks = Array.from(document.querySelectorAll("pre[data-run]"));
    if (blocks.length === 0) {
        return;
    }

    let worker = null;
    let ready = false;
    let busy = false;
    let nextId = 0;
    let timer = null;
    let active = null;

    const entries = blocks.map((pre) => {
        const bar = document.createElement("div");
        bar.className = "run-bar";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "run-btn";
        button.textContent = LABEL_RUN;
        bar.append(button);

        const out = document.createElement("div");
        out.className = "out";
        out.hidden = true;
        out.setAttribute("aria-live", "polite");

        pre.before(bar);
        pre.after(out);

        return { pre, button, out, cell: pre.closest(".td") };
    });

    function codeOf(entry) {
        return entry.pre.querySelector("code").textContent;
    }

    function codesUpTo(entry) {
        const group = entry.cell ? entries.filter((item) => item.cell === entry.cell) : [entry];
        return group.slice(0, group.indexOf(entry) + 1).map(codeOf);
    }

    function setBusy(value, entry, label) {
        busy = value;
        for (const item of entries) {
            item.button.disabled = value;
            item.button.textContent = value && item === entry ? label : LABEL_RUN;
        }
    }

    function show(entry, text, isError) {
        const clean = text.replace(/\s+$/, "");
        entry.out.hidden = false;
        entry.out.classList.toggle("err", isError);
        entry.out.textContent = clean.length > 0 ? clean : "(нет вывода)";
    }

    function finish() {
        clearTimeout(timer);
        timer = null;
        setBusy(false);
        active = null;
    }

    function dropWorker() {
        if (worker) {
            worker.terminate();
        }
        worker = null;
        ready = false;
    }

    function fail(text) {
        if (active) {
            show(active.entry, text, true);
        }
        dropWorker();
        finish();
    }

    function send() {
        active.sent = true;
        setBusy(true, active.entry, LABEL_RUNNING);
        timer = setTimeout(() => {
            fail("Превышено время выполнения (" + TIMEOUT_MS / 1000 + " с). Возможно, в коде бесконечный цикл.");
        }, TIMEOUT_MS);
        worker.postMessage({ type: "run", id: active.id, codes: active.codes });
    }

    function onMessage(event) {
        const message = event.data;

        if (message.type === "ready") {
            ready = true;
            if (active && !active.sent) {
                send();
            }
            return;
        }

        if (message.type === "fatal") {
            fail("Не удалось загрузить Python: " + message.text);
            return;
        }

        if (message.type !== "result" || !active || message.id !== active.id) {
            return;
        }

        let text = message.output;
        if (!message.ok) {
            const where = message.block < message.last ? "Ошибка в блоке выше (№ " + (message.block + 1) + "):\n" : "";
            text = text + where + message.error;
        }
        if (message.truncated) {
            text = text.replace(/\s+$/, "") + "\n… вывод обрезан";
        }
        show(active.entry, text, !message.ok);
        finish();
    }

    function startWorker() {
        worker = new Worker(WORKER_URL);
        ready = false;
        worker.onmessage = onMessage;
        worker.onerror = () => {
            fail("Не удалось загрузить Python. Страницу нужно открывать через сервер, а не файлом.");
        };
    }

    function run(entry) {
        if (busy) {
            return;
        }
        nextId += 1;
        active = { id: nextId, entry, codes: codesUpTo(entry), sent: false };

        if (!worker) {
            startWorker();
        }
        if (ready) {
            send();
        } else {
            setBusy(true, entry, LABEL_LOADING);
        }
    }

    for (const entry of entries) {
        entry.button.addEventListener("click", () => run(entry));
    }
})();