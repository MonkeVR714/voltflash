<!-- boards: -->
# Popular libraries

## TFT_eSPI and LovyanGFX (displays)
- TFT_eSPI: fast, but pins/driver are set in the library's User_Setup.h (or a User_Setup_Select.h include), not in the sketch.
```cpp
#include <TFT_eSPI.h>
TFT_eSPI tft;
void setup() { tft.init(); tft.setRotation(1); tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK); tft.drawString("Hello", 10, 10, 4); }
```
- Sprites (flicker-free drawing): TFT_eSprite spr(&tft); spr.createSprite(w, h); draw into spr; spr.pushSprite(x, y).
- LovyanGFX: pins/driver configured in code with a class; supports many boards out of the box (LGFX_AUTODETECT).
- LVGL: a full GUI toolkit (buttons, sliders, charts) running on top of a display driver. Needs a flush callback and lv_timer_handler() in loop; LVGL 9 and 8 have different APIs.

## ArduinoJson 7
```cpp
#include <ArduinoJson.h>
JsonDocument doc;                       // v7: no size needed
deserializeJson(doc, jsonText);
float t = doc["temp"];
doc["led"] = true;
serializeJson(doc, Serial);
```
- v6 code uses StaticJsonDocument<256> / DynamicJsonDocument; in v7 replace with JsonDocument.

## MQTT with PubSubClient
```cpp
#include <WiFi.h>
#include <PubSubClient.h>
WiFiClient net; PubSubClient mqtt(net);
mqtt.setServer("192.168.1.10", 1883);
mqtt.setCallback([](char* topic, byte* payload, unsigned int len) { /* ... */ });
if (mqtt.connect("esp32-client")) mqtt.subscribe("home/led");
mqtt.publish("home/temp", "21.5");
// call mqtt.loop() often in loop()
```

## LEDs: FastLED and Adafruit_NeoPixel
```cpp
#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel strip(30, 5, NEO_GRB + NEO_KHZ800); // count, pin
strip.begin(); strip.setBrightness(50);
strip.setPixelColor(0, strip.Color(255, 0, 0)); strip.show();
```
- FastLED: CRGB leds[30]; FastLED.addLeds<WS2812B, 5, GRB>(leds, 30); leds[0] = CRGB::Red; FastLED.show();
- On ESP32-S3 DevKits the onboard RGB LED works without a library: neopixelWrite(48, r, g, b).

## Sensors and misc libraries
- Adafruit_BME280: bme.begin(0x76); bme.readTemperature(), readHumidity(), readPressure()/100.0F (hPa).
- DHT: DHT dht(pin, DHT22); dht.begin(); dht.readTemperature(); returns NaN on read error.
- OneWire + DallasTemperature: sensors.requestTemperatures(); sensors.getTempCByIndex(0) (-127 = not found).
- ESP32Servo: Servo s; s.attach(pin); s.write(90);
- WiFiManager (tzapu): shows a setup portal access point when no WiFi is saved: wm.autoConnect("Setup-AP").
- ESPAsyncWebServer + AsyncTCP: non-blocking web server (use the ESP32Async maintained forks).
- RadioLib: LoRa (SX1262, SX1276), FSK and more. NimBLE-Arduino: lightweight BLE.
- M5Unified: all M5Stack devices (see M5Stack notes). XPT2046_Touchscreen: CYD resistive touch.
