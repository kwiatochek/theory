const PYODIDE_VERSION = "0.29.5";
const MAX_CHARS = 5000;

importScripts(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`);

let pyodide = null;
let chunks = [];
let total = 0;
let truncated = false;
let capturing = false;

function collect(line) {
    if (!capturing || truncated) {
        return;
    }
    const text = line + "\n";
    if (total + text.length > MAX_CHARS) {
        chunks.push(text.slice(0, MAX_CHARS - total));
        total = MAX_CHARS;
        truncated = true;
        return;
    }
    chunks.push(text);
    total += text.length;
}

function cleanTrace(message) {
    const lines = String(message).trim().split("\n");
    const start = lines.findIndex((line) => line.includes('File "<exec>"'));
    if (start === -1) {
        return lines.slice(-3).join("\n");
    }
    return lines.slice(start).join("\n");
}

function execute(codes) {
    chunks = [];
    total = 0;
    truncated = false;
    capturing = false;

    const globals = pyodide.globals.get("dict")();
    const last = codes.length - 1;

    try {
        for (let i = 0; i < codes.length; i++) {
            capturing = i === last;
            try {
                pyodide.runPython(codes[i], { globals });
            } catch (error) {
                capturing = false;
                return {
                    ok: false,
                    output: chunks.join(""),
                    error: cleanTrace(error.message),
                    block: i,
                    last,
                    truncated,
                };
            }
        }
        return { ok: true, output: chunks.join(""), truncated };
    } finally {
        capturing = false;
        globals.destroy();
    }
}

async function init() {
    pyodide = await loadPyodide({
        stdout: collect,
        stderr: collect,
        stdin: () => undefined,
    });
    postMessage({ type: "ready" });
}

const starting = init().catch((error) => {
    postMessage({ type: "fatal", text: String(error && error.message ? error.message : error) });
});

onmessage = async (event) => {
    const message = event.data;
    if (!message || message.type !== "run") {
        return;
    }
    await starting;
    if (!pyodide) {
        return;
    }
    const result = execute(message.codes);
    postMessage({ type: "result", id: message.id, ...result });
};