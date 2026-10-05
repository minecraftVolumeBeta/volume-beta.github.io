const pako = window.pako;
const Base64 = window.Base64;
const sha1 = window.sha1;

const levelString = document.getElementById('levelString');
const decodeButton = document.getElementById('decodeLvlStr');
const saveGMDButton = document.getElementById('saveGMD');
const gmdFile = document.getElementById('gmdUpload');
const lvlStrOutput = document.getElementById('lvlStrOutput');
const compressGzipButton = document.getElementById('compressGzip');
const encodeToLvlStrButton = document.getElementById('encodeToLvlStr');

const paramContainer = document.getElementById('paramContainer');
const requestType = document.getElementById('requestType');
const requestParams = document.getElementById('requestParams');
const addParamBtn = document.getElementById('addParam');
const deleteParamBtn = document.getElementById('deleteParam');
const requestButton = document.getElementById('sendRequest');
const responseOutput = document.getElementById('responseOutput');
const downloadResponse = document.getElementById('downloadResponse');

const encryptionType = document.getElementById('encryptionType');
const username = document.getElementById('username');
const password = document.getElementById('password');
const plaintext = document.getElementById('plaintext');
const saltType = document.getElementById('saltType');
const xorType = document.getElementById('xorType');
const encryptButton = document.getElementById('generateEncryption');
const encryptionOutput = document.getElementById('encryptionOutput');

const API_BASE_URL = 'https://volume-beta-github-io.vercel.app';

let k2Regex = /<k>k2<\/k>\s*<s>(.+?)<\/s>/
let k4Regex = /<k>k4<\/k>\s*<s>(.+?)<\/s>/

function gzipDecode(str) {
    let toDecode = b64Decode(str);
    toDecode = new Uint8Array(toDecode.split('').map(x => x.charCodeAt(0)));
    return new TextDecoder().decode(pako.inflate(toDecode));
}

function decode() {
    if (!levelString.value) return;
    let k4 = levelString.value.match(k4Regex);
    let levelData = k4 ? k4[1] : levelString.value;
    try {
        lvlStrOutput.value = (!levelData.startsWith('k') ? gzipDecode(levelData) : levelData).replace(/;/g, ';\n');
    }
    catch (e) {
        lvlStrOutput.value = 'Error decoding!\n' + e.message;
    }
}

function encode(toLvlStr) {
    if (!lvlStrOutput.value || lvlStrOutput.value.startsWith('H4s')) return;
    let compressed = pako.gzip(lvlStrOutput.value.replace(/\n/g, ''), { to: 'string' });
    let res = "";
    let chunkSize = 60000;
    for (let i=0; i<compressed.length; i+=60000) {
        res += String.fromCharCode.apply(null, compressed.slice(i, i+chunkSize));
    }
    let encoded = b64Encode(res);
    if (!toLvlStr) lvlStrOutput.value = encoded;
    else {
        let k4Match = levelString.value.match(k4Regex);
        if (k4Match) {
            levelString.value = levelString.value.replace(k4Match[1], encoded);
        }
    }
}

function saveGMD() {
    let name = levelString.value.match(k2Regex);
    let lvlData = levelString.value.match(k4Regex);
    if (!lvlData) return;
    let blob = new Blob([levelString.value], { type: 'text/plain;charset=utf-8' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `${name ? name[1] : 'level'}.gmd`;
    a.click();
    URL.revokeObjectURL(url);
}

// request part

let paramPresets = {};
fetch('./requestParamPresets.json')
  .then(response => response.json())
  .then(data => { paramPresets = data; })
  .catch(error => console.error('Error:', error));

function addParam() {
    let newParam = document.createElement('div');
    newParam.classList.add('param');
    newParam.innerHTML = `<input type="text" placeholder="param name" class="paramName"><input type="text" placeholder="param value" class="paramValue">`;
    requestParams.appendChild(newParam);
}

function createDefaultParams() {
    let selected = requestType.value;
    let presets = paramPresets[selected];
    if (presets) {
        paramContainer.innerHTML = '';
        presets.forEach(p => {
            let key = Object.keys(p)[0];
            let value = p[key];
            let newParam = document.createElement('div');
            newParam.classList.add('param');
            newParam.innerHTML = `<input type="text" placeholder="param name" class="paramName" value="${key}"><input type="text" placeholder="param value" class="paramValue" value="${value}">`;
            paramContainer.appendChild(newParam);
        });
    }
}

function deleteParam(param) {
    requestParams.removeChild(param);
}

async function sendRequest() {
    let selected = requestType.value;
    let params = {};
    let paramRows = document.querySelectorAll('#paramContainer .param');
    paramRows.forEach(row => {
        let nameInput = row.querySelector('.paramName');
        let valueInput = row.querySelector('.paramValue');

        if (nameInput && valueInput) {
            let key = nameInput.value.trim();
            let value = valueInput.value.trim();
            if (key !== '') {
                params[key] = value;
            }
        }
    });

    try {
        let response = await fetch(`${API_BASE_URL}/api/proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                endpoint: selected,
                params: params
            })
        });

        let data = await response.text();
        document.getElementById('responseOutput').value = data;
    } catch (error) {
        console.error('Error sending request:', error);
    }
}

// encryption stuff

let constants = null;
fetch('./constants.json')
    .then(response => response.json())
    .then(data => { constants = data; })
    .catch(error => console.error('Error:', error));

function b64Decode(str) {
    return Base64.atob(str.replace(/_/g, '/').replace(/-/g, '+'));
}
function b64Encode(str) {
    return Base64.btoa(str).replace(/\//g, '_').replace(/\+/g, '-');
}

function cyclicXor(str, key) {
    let res = "";
    for (let i=0; i<str.length; i++) {
        res += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return res;
}

function singularXor(str, key) {
    let res = "";
    for (let i=0; i<str.length; i++) {
        res += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(0));
    }
    return res;
}

function generateChk(values, key, salt) {
    values += salt;
    values = sha1.hex(values);
    values = cyclicXor(values, key);
    return b64Encode(values);
}

function robtopCipher(str, key, isCyclic = true) {
    if (isCyclic) {
        let cxorText = cyclicXor(str, key);
        return b64Encode(cxorText);
    }
    else {
        let sxorText = singularXor(str, key);
        return b64Encode(sxorText);
    }
}

function getGjp2(password, salt) {
    let res = password + salt;
    return sha1.hex(res);
}

function getEncryption() {
    if (!constants) return;
    if (!username.value || !password.value) console.log('no username or password loaded');
    let salt = constants.salts;
    let xorKey = constants.keys;
    if (!encryptionType.value || !saltType.value || !xorType.value) return;
    switch (encryptionType.value) {
        case 'gjp2':
            return getGjp2(password.value, salt[saltType.selectedIndex]);
        case 'robtopCipher':
            return robtopCipher(levelString.value, xorKey[xorType.selectedIndex], (xorKey.value !== 'saveData' ? true : false));
        case 'chk':
            return generateChk(levelString.value, xorKey[xorType.selectedIndex], salt[saltType.selectedIndex]);
    }
}

// page stuff

let currentPageIndex = 0;
const pages = document.querySelectorAll('.page');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageIndicator = document.getElementById('pageIndicator');

function showPage(index) {
    pages.forEach((page, i) => {
        if (i === index) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });
    if (pageIndicator) {
        pageIndicator.textContent = `${index + 1}/${pages.length}`;
    }
}

// event listeners

gmdFile.addEventListener('change', (event) => {
    let file = event.target.files[0];
    if (file) {
        let reader = new FileReader();
        reader.onload = function(e) {
            let text = e.target.result;
            if (!text.match(k4Regex)) return lvlStrOutput.value = "Invalid .gmd file";
            else levelString.value = text;
            decode();
        }
        reader.readAsText(file);
    }
});

compressGzipButton.addEventListener('click', () => {
    encode();
});

encodeToLvlStrButton.addEventListener('click', () => {
    encode(true);
});

saveGMDButton.addEventListener('click', saveGMD);

decodeButton.addEventListener('click', decode);

addParamBtn.addEventListener('click', () => {
    let newParam = document.createElement('div');
    newParam.classList.add('param');
    newParam.innerHTML = `
        <input type="text" placeholder="param name" class="paramName">
        <input type="text" placeholder="param value" class="paramValue">
        <button type="button" class="deleteParam">X</button>
    `;
    paramContainer.appendChild(newParam);
});
deleteParamBtn.addEventListener('click', () => {
    let params = requestParams.querySelectorAll('.param');
    deleteParam(params[params.length - 1]);
});

requestType.addEventListener('change', () => {
    createDefaultParams();
});

requestButton.addEventListener('click', sendRequest);

downloadResponse.addEventListener('click', () => {
    let blob = new Blob([responseOutput.value], { type: 'text/plain;charset=utf-8' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `${requestType.value}_response.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

encryptButton.addEventListener('click', () => {
    encryptionOutput.value = getEncryption();
});

prevBtn.addEventListener('click', () => {
    currentPageIndex = (currentPageIndex - 1 + pages.length) % pages.length;
    showPage(currentPageIndex);
});

nextBtn.addEventListener('click', () => {
    currentPageIndex = (currentPageIndex + 1) % pages.length;
    showPage(currentPageIndex);
});

showPage(0);