<!-- boards: esp32,esp32s3,esp32s3cdc,esp32c3,cyd,cyd2usb,m5core,m5core2,m5cores3,m5stickcplus,m5stickcplus2,m5cardputer -->
# Arduino-ESP32 core 3.x API cheatsheet

## Sketch basics and non-blocking timing
- setup() runs once, loop() runs forever. Never block loop for long; use millis() timing instead of long delay():
```cpp
unsigned long last = 0;
void loop() {
  if (millis() - last >= 1000) { last = millis(); Serial.println("tick"); }
}
```
- Serial.begin(115200) for ESP32 (Arduino AVR boards usually 9600). Serial.printf() works on ESP32.
- Buttons: pinMode(pin, INPUT_PULLUP); pressed when digitalRead(pin) == LOW. Debounce ~30 ms.
- Interrupts: `void IRAM_ATTR onPress() { pressed = true; }` + `attachInterrupt(pin, onPress, FALLING);` Keep ISRs tiny and use volatile flags.

## WiFi
```cpp
#include <WiFi.h>
WiFi.mode(WIFI_STA);
WiFi.begin("ssid", "password");
while (WiFi.status() != WL_CONNECTED) delay(250);
Serial.println(WiFi.localIP());
```
- ESP32 only does 2.4 GHz WiFi (not 5 GHz). Access point: WiFi.softAP("name", "password8chars").
- Scan: int n = WiFi.scanNetworks(); WiFi.SSID(i), WiFi.RSSI(i).
- Web server: #include <WebServer.h>, WebServer server(80); server.on("/", handler); server.begin(); server.handleClient() in loop.
- HTTP requests: #include <HTTPClient.h>; HTTPClient http; http.begin(url); int code = http.GET(); String body = http.getString(); http.end();
- Time: configTime(0, 0, "pool.ntp.org"); then getLocalTime(&tm).

## PWM (LEDC) in core 3.x
- Core 3.x changed the API. Use:
```cpp
ledcAttach(pin, 5000, 8);   // pin, frequency Hz, resolution bits
ledcWrite(pin, 128);        // duty 0-255 for 8 bits
```
- The old 2.x calls ledcSetup()/ledcAttachPin() no longer exist in 3.x ("was not declared in this scope").
- analogWrite(pin, 0-255) also works on ESP32 in core 3.x.
- Tone: ledcWriteTone(pin, freq) after ledcAttach, or tone(pin, freq).

## Storage: Preferences, LittleFS, SD
- Preferences (key/value in flash, survives reboot):
```cpp
#include <Preferences.h>
Preferences prefs;
prefs.begin("app", false);
int boots = prefs.getInt("boots", 0);
prefs.putInt("boots", boots + 1);
prefs.end();
```
- LittleFS: #include <LittleFS.h>; LittleFS.begin(true); File f = LittleFS.open("/a.txt", "w");
- SD: #include <SD.h>; SD.begin(csPin) (CYD: SD.begin(5)).

## I2C and SPI
- I2C: Wire.begin(SDA, SCL); Wire.setClock(400000). Scan for devices by trying addresses 1-126 with Wire.beginTransmission(addr) / Wire.endTransmission() == 0.
- SPI: SPI.begin(SCK, MISO, MOSI, SS). Separate bus: SPIClass hspi(HSPI); hspi.begin(14, 12, 13, 15).
- Extra UART: Serial2.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN).

## Deep sleep and power
```cpp
esp_sleep_enable_timer_wakeup(60ULL * 1000000ULL); // 60 s in microseconds
esp_deep_sleep_start();
```
- Wake on a pin: esp_sleep_enable_ext0_wakeup(GPIO_NUM_33, 0); (RTC-capable pins only).
- Variables that survive deep sleep: RTC_DATA_ATTR int count = 0;
- After deep sleep the sketch starts again from setup().

## Tasks, memory, system
- Run code on the other core: xTaskCreatePinnedToCore(task, "name", 4096, NULL, 1, NULL, 0);
- ESP.getFreeHeap(), ESP.getPsramSize(), ESP.getChipModel(), ESP.restart().
- psramFound() tells if PSRAM is enabled (enable it in board options).
- Watchdog resets ("Task watchdog got triggered") come from loops that never yield: add delay(1) or yield().

## Bluetooth
- BLE is on all ESP32 chips; Bluetooth Classic (BluetoothSerial) only on the original ESP32, not S3/C3.
- For BLE the NimBLE-Arduino library uses much less memory than the built-in BLEDevice.

## OTA updates
- ArduinoOTA: ArduinoOTA.setHostname("dev"); ArduinoOTA.begin(); ArduinoOTA.handle() in loop. Needs a partition scheme with OTA space (default has it).
