// Sketch folders for the mini IDE. Each sketch is a folder named like its
// main .ino file, the layout arduino-cli expects.
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const store = require('./store');

const TEMPLATES = {
  blank: {
    name: 'Blank sketch',
    board: 'esp32',
    code: `void setup() {
  Serial.begin(115200);
}

void loop() {

}
`,
  },
  blink: {
    name: 'Blink LED',
    board: 'esp32',
    code: `// Blinks the on-board LED. Change LED_PIN if your board uses another pin.
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif
const int LED_PIN = LED_BUILTIN;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  Serial.println("Blink started");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
`,
  },
  wifiscan: {
    name: 'WiFi network scanner',
    board: 'esp32',
    code: `#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  Serial.println("WiFi scanner ready");
}

void loop() {
  int n = WiFi.scanNetworks();
  Serial.printf("\\nFound %d networks\\n", n);
  for (int i = 0; i < n; i++) {
    Serial.printf("%2d  %-32s  %4d dBm  ch %2d  %s\\n", i + 1, WiFi.SSID(i).c_str(),
                  WiFi.RSSI(i), WiFi.channel(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "secured");
  }
  WiFi.scanDelete();
  delay(5000);
}
`,
  },
  webserver: {
    name: 'WiFi web server (LED switch)',
    board: 'esp32',
    code: `#include <WiFi.h>
#include <WebServer.h>

// Put your WiFi details here
const char *SSID = "your-network";
const char *PASSWORD = "your-password";
const int LED_PIN = 2;

WebServer server(80);
bool ledOn = false;

void handleRoot() {
  String html = "<html><body style='font-family:sans-serif;text-align:center;margin-top:3em'>";
  html += "<h1>ESP32 LED</h1><p>LED is <b>" + String(ledOn ? "ON" : "OFF") + "</b></p>";
  html += "<a href='/toggle'><button style='font-size:2em'>Toggle</button></a></body></html>";
  server.send(200, "text/html", html);
}

void handleToggle() {
  ledOn = !ledOn;
  digitalWrite(LED_PIN, ledOn);
  server.sendHeader("Location", "/");
  server.send(303);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  WiFi.begin(SSID, PASSWORD);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\\nOpen http://%s in your browser\\n", WiFi.localIP().toString().c_str());
  server.on("/", handleRoot);
  server.on("/toggle", handleToggle);
  server.begin();
}

void loop() {
  server.handleClient();
}
`,
  },
  cydled: {
    name: 'CYD RGB LED + backlight',
    board: 'cyd',
    code: `// Cheap Yellow Display (ESP32-2432S028R): cycles the RGB LED on the back
// and pulses the screen backlight. Needs no extra libraries.
// The LED is active-low: LOW turns a colour on.
const int LED_R = 4;
const int LED_G = 16;
const int LED_B = 17;
const int BACKLIGHT = 21;

void setColor(bool r, bool g, bool b) {
  digitalWrite(LED_R, !r);
  digitalWrite(LED_G, !g);
  digitalWrite(LED_B, !b);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_R, OUTPUT);
  pinMode(LED_G, OUTPUT);
  pinMode(LED_B, OUTPUT);
  pinMode(BACKLIGHT, OUTPUT);
  digitalWrite(BACKLIGHT, HIGH);
  Serial.println("CYD demo running");
}

void loop() {
  const bool colors[][3] = {{1,0,0}, {0,1,0}, {0,0,1}, {1,1,0}, {0,1,1}, {1,0,1}, {1,1,1}};
  for (auto &c : colors) {
    setColor(c[0], c[1], c[2]);
    delay(400);
  }
  setColor(0, 0, 0);
  digitalWrite(BACKLIGHT, LOW);
  delay(300);
  digitalWrite(BACKLIGHT, HIGH);
}
`,
  },
  cydscreen: {
    name: 'CYD touch screen demo (TFT_eSPI)',
    board: 'cyd',
    libs: ['TFT_eSPI', 'XPT2046_Touchscreen'],
    code: `// Cheap Yellow Display drawing demo: touch the screen to draw.
// Libraries: TFT_eSPI and XPT2046_Touchscreen (install them from Libraries).
// TFT_eSPI needs the CYD pin setup: in TFT_eSPI's User_Setup.h use
// ILI9341_2_DRIVER, TFT_MISO 12, TFT_MOSI 13, TFT_SCLK 14, TFT_CS 15,
// TFT_DC 2, TFT_RST -1, TFT_BL 21, TFT_BACKLIGHT_ON HIGH, USE_HSPI_PORT.
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>

#define XPT2046_IRQ 36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33

SPIClass touchSpi(VSPI);
XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft;

void setup() {
  Serial.begin(115200);
  touchSpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  touch.begin(touchSpi);
  touch.setRotation(1);
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawCentreString("Touch to draw", 160, 8, 2);
}

void loop() {
  if (touch.tirqTouched() && touch.touched()) {
    TS_Point p = touch.getPoint();
    int x = map(p.x, 200, 3700, 0, 320);
    int y = map(p.y, 240, 3800, 0, 240);
    tft.fillCircle(x, y, 3, TFT_CYAN);
  }
}
`,
  },
  m5hello: {
    name: 'M5Stack hello (M5Unified)',
    board: 'm5core2',
    libs: ['M5Unified'],
    code: `// Works on most M5Stack devices. Library: M5Unified (install from Libraries).
#include <M5Unified.h>

int presses = 0;

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setTextSize(2);
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setCursor(10, 10);
  M5.Display.println("Hello from VoltFlash!");
  M5.Display.println("Press button A");
}

void loop() {
  M5.update();
  if (M5.BtnA.wasPressed()) {
    presses++;
    M5.Display.fillRect(0, 80, M5.Display.width(), 40, TFT_BLACK);
    M5.Display.setCursor(10, 80);
    M5.Display.printf("Pressed %d times", presses);
    M5.Speaker.tone(2000, 50);
  }
  delay(10);
}
`,
  },
  unoblink: {
    name: 'Arduino Uno blink + serial',
    board: 'uno',
    code: `void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("LED on");
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("LED off");
  delay(1000);
}
`,
  },
};

const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/;
const SAFE_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}\.(ino|h|hpp|c|cpp|txt|md|json)$/i;

function dir(name) {
  if (!SAFE_NAME.test(name)) throw new Error('Sketch names can use letters, numbers, _ . and - (no spaces).');
  return path.join(store.paths.sketches, name);
}

function templates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, board: t.board, libs: t.libs || [] }));
}

function list() {
  return fs.readdirSync(store.paths.sketches, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(store.paths.sketches, d.name, d.name + '.ino')))
    .map((d) => {
      const meta = store.readJson(path.join(store.paths.sketches, d.name, '.voltflash.json'), {});
      const stat = fs.statSync(path.join(store.paths.sketches, d.name, d.name + '.ino'));
      return { name: d.name, board: meta.board || null, modified: stat.mtimeMs };
    })
    .sort((a, b) => b.modified - a.modified);
}

function create(name, templateId = 'blank') {
  const d = dir(name);
  if (fs.existsSync(d)) throw new Error(`A sketch called "${name}" already exists.`);
  const t = TEMPLATES[templateId] || TEMPLATES.blank;
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name + '.ino'), t.code);
  store.writeJson(path.join(d, '.voltflash.json'), { board: t.board, template: templateId, libs: t.libs || [] });
  return { name, board: t.board, libs: t.libs || [] };
}

function files(name) {
  const d = dir(name);
  const main = name + '.ino';
  return fs.readdirSync(d)
    .filter((f) => SAFE_FILE.test(f))
    .sort((a, b) => (a === main ? -1 : b === main ? 1 : a.localeCompare(b)));
}

function filePath(name, file) {
  if (!SAFE_FILE.test(file)) throw new Error('Unsupported file name.');
  return path.join(dir(name), file);
}

function read(name, file) {
  return fs.readFileSync(filePath(name, file), 'utf8');
}

function write(name, file, content) {
  fs.writeFileSync(filePath(name, file), content);
  return true;
}

// Remembers the board picked for a sketch.
function setBoard(name, board) {
  const metaFile = path.join(dir(name), '.voltflash.json');
  store.writeJson(metaFile, { ...store.readJson(metaFile, {}), board });
  return true;
}

function addFile(name, file) {
  const p = filePath(name, file);
  if (fs.existsSync(p)) throw new Error(`${file} already exists.`);
  const guard = file.replace(/\W/g, '_').toUpperCase();
  fs.writeFileSync(p, /\.(h|hpp)$/i.test(file) ? `#pragma once\n// ${guard}\n` : '');
  return files(name);
}

// Moves the sketch to the Recycle Bin so it can be restored.
async function trash(name) {
  await shell.trashItem(dir(name));
  return list();
}

module.exports = { templates, list, create, files, read, write, setBoard, addFile, trash, dir, TEMPLATES };
