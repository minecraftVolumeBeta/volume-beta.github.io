const DISPLAY_SIZE = 512;
const MAX_MEMORY_SIZE = 256 * 1024 * 1024;
let memory = new Uint8Array(64);
let ptr = 0;
let code = "";
let ip = 0;
let inputPtr = 0;
let isRunning = false;
let timerId = null;

const codeInput = document.getElementById("code-input");
const codeHighlight = document.getElementById("code-highlight");
const inputStream = document.getElementById("input-stream");
const inputLabel = document.getElementById("input-label");
const outputField = document.getElementById("output-field");
const speedSlider = document.getElementById("speed-slider");
const speedVal = document.getElementById("speed-val");
const memoryBody = document.getElementById("memory-body");

const btnRun = document.getElementById("btn-run");
const btnPause = document.getElementById("btn-pause");
const btnStep = document.getElementById("btn-step");
const btnStop = document.getElementById("btn-stop");

const NON_PRINTABLE_CHARS = [
    "NUL",
    "SOH",
    "STX",
    "ETX",
    "EOT",
    "ENQ",
    "ACK",
    "BEL",
    "BS",
    "HT",
    "LF",
    "VT",
    "FF",
    "CR",
    "SO",
    "SI",
    "DLE",
    "DC1",
    "DC2",
    "DC3",
    "DC4",
    "NAK",
    "SYN",
    "ETB",
    "CAN",
    "EM",
    "SUB",
    "ESC",
    "FS",
    "GS",
    "RS",
    "US",
];

function initTable() {
    const fragment = document.createDocumentFragment();
    for (let i=0; i<DISPLAY_SIZE; i++) {
        const tr = document.createElement("tr");
        tr.id = `mem-row-${i}`;

        const tdIndex = document.createElement("td");
        tdIndex.textContent = `[${i.toString().padStart(3, "0")}]`;

        const tdVal = document.createElement("td");
        tdVal.className = "cell-val";
        tdVal.textContent = "0";

        const tdHex = document.createElement("td");
        tdHex.className = "cell-hex";
        tdHex.textContent = "0x00";

        const tdAscii = document.createElement("td");
        tdAscii.className = "cell-ascii";
        tdAscii.textContent = "NUL";

        tr.appendChild(tdIndex);
        tr.appendChild(tdVal);
        tr.appendChild(tdHex);
        tr.appendChild(tdAscii);
        fragment.appendChild(tr);
    }
    memoryBody.appendChild(fragment);
}

function ensureMemoryCapacity(index) {
    if (index >= MAX_MEMORY_SIZE) {
        throw new Error(`Your program exceeds 256MB of memory. Last pointer access: ${index}`);
    }
    if (index >= memory.length) {
        let newCapacity = memory.length * 2;
        while (newCapacity <= index) {
            newCapacity *= 2;
        }
        newCapacity = Math.min(newCapacity, MAX_MEMORY_SIZE);

        const newMemory = new Uint8Array(newCapacity);
        newMemory.set(memory);
        memory = newMemory;
    }
}

function updateUI() {
    renderHighlight();
    updateTable();
    updateInputLabel();
}

function updateInputLabel() {
    if (ip < code.length && code[ip] === ',') {
        inputLabel.innerHTML = '<strong>Enter a byte:</strong> (for <code>,</code> operator)';
        inputLabel.classList.add("waiting-input");
    }
    else {
        inputLabel.innerHTML = 'Input Buffer (for <code>,</code> operator):';
        inputLabel.classList.remove("waiting-input");
    }
}

function renderHighlight() {
    if (ip >= code.length || ip < 0) {
        codeHighlight.innerHTML = escapeHtml(code);
        return;
    }
    const before = escapeHtml(code.slice(0, ip));
    const current = escapeHtml(code[ip]);
    const after = escapeHtml(code.slice(ip+1));

    codeHighlight.innerHTML = `${before}<span class="highlight">${current}</span>${after}`;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function updateTable() {
    const currentActive = memoryBody.querySelector(".active-pointer");
    if (currentActive) {
        currentActive.classList.remove("active-pointer");
    }
    if (ptr < DISPLAY_SIZE) {
        const row = document.getElementById(`mem-row-${ptr}`);
        if (row) {
            const val = memory[ptr];
            row.classList.add("active-pointer");
            row.querySelector(".cell-val").textContent = val;
            row.querySelector(".cell-hex").textContent = "0x" + val.toString(16).padStart(2, "0").toUpperCase();
            row.querySelector(".cell-ascii").textContent = getAsciiChar(val);

            row.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }
}

function getAsciiChar(byte) {
    if (byte < NON_PRINTABLE_CHARS.length) {
        return NON_PRINTABLE_CHARS[byte];
    }
    return String.fromCharCode(byte);
}

function findMatchingBracket(direction) {
    let depth = 1;
    while (ip + direction >= 0 && ip + direction < code.length) {
        ip += direction;
        if (code[ip] === '[') depth += direction;
        if (code[ip] === ']') depth -= direction;
        if (depth === 0) return;
    }
}

function step() {
    if (ip >= code.length) {
        stop();
        return false;
    }

    const op = code[ip];

    try {
        switch(op) {
            case '>':
                ptr++;
                ensureMemoryCapacity(ptr);
                break;
            case '<':
                if (ptr > 0) ptr--;
                break;
            case '+':
                ensureMemoryCapacity(ptr);
                memory[ptr] = (memory[ptr] + 1) & 255;
                break;
            case '-':
                ensureMemoryCapacity(ptr);
                memory[ptr] = (memory[ptr] - 1 + 256) & 255;
                break;
            case '.':
                ensureMemoryCapacity(ptr);
                outputField.value += String.fromCharCode(memory[ptr]);
                outputField.scrollTop = outputField.scrollHeight;
                break;
            case ',':
                ensureMemoryCapacity(ptr);
                const inputs = inputStream.value;
                if (inputPtr < inputs.length) {
                    memory[ptr] = inputs.charCodeAt(inputPtr++);
                }
                else {
                    memory[ptr] = 0;
                }
                break;
            case '[':
                ensureMemoryCapacity(ptr);
                if (memory[ptr] === 0) findMatchingBracket(1);
                break;
            case ']':
                ensureMemoryCapacity(ptr);
                if (memory[ptr] !== 0) findMatchingBracket(-1);
                break;
        }
    }
    catch (err) {
        alert(err.message);
        stop();
        return false;
    }

    ip++;
    updateUI();
    return true;
}

function run() {
    if (!isRunning) {
        if (ip === 0) resetExecutionState();
        isRunning = true;
        toggleButtons(true);
    }

    const delay = parseInt(speedSlider.value, 10);
    timerId = setTimeout(() => {
        if (step()) {
            run();
        }
    }, delay);
}

function pause() {
    isRunning = false;
    clearTimeout(timerId);
    toggleButtons(false);
}

function stop() {
    pause();
    ip = 0;
    updateUI();
}

function resetExecutionState() {
    memory = new Uint8Array(64);
    ptr = 0;
    ip = 0;
    inputPtr = 0;
    outputField.value = "";
    code = codeInput.value;

    for (let i=0; i<DISPLAY_SIZE; i++) {
        const row = document.getElementById(`mem-row-${i}`);
        if (row) {
            row.querySelector(".cell-val").textContent = "0";
            row.querySelector(".cell-hex").textContent = "0x00";
            row.querySelector(".cell-ascii").textContent = "NUL";
        }
    }
}

function toggleButtons(running) {
    btnRun.disabled = running;
    btnPause.disabled = !running;
    btnStep.disabled = running;
    btnStop.disabled = !running && ip === 0;
}

btnRun.addEventListener("click", run);
btnPause.addEventListener("click", pause);
btnStep.addEventListener("click", () => {
    if (ip === 0 && !isRunning) resetExecutionState();
    step();
});
btnStop.addEventListener("click", stop);

speedSlider.addEventListener("input", (e) => {
    speedVal.textContent = e.target.value;
});

codeInput.addEventListener("input", () => {
    code = codeInput.value;
    renderHighlight();
});

codeInput.addEventListener("scroll", () => {
    codeHighlight.scrollTop = codeInput.scrollTop;
    codeHighlight.scrollLeft = codeInput.scrollLeft;
});

initTable();