<!-- boards: -->
# Firmware files and flashing

## ESP32 flash layout
- A complete ESP32 firmware is several parts: bootloader, partition table (at 0x8000), and the app (usually at 0x10000). Some also have a filesystem image (SPIFFS/LittleFS) and OTA data.
- Bootloader offset: 0x1000 on ESP32 and ESP32-S2, 0x0 on ESP32-S3, C3, C6, H2.
- A "merged" / "factory" / "full" .bin contains all parts and is flashed at 0x0. This is the easiest kind: it works on a blank board.
- An "app-only" / "firmware.bin" / "update.bin" contains only the app. Flash it at 0x10000 and only if the board already has a matching bootloader and partition table (e.g. for updates). It is also what OTA update pages expect.
- Firmware for one chip doesn't run on another (ESP32 vs S3 vs C3).

## Partition tables
- The table lists partitions: nvs (settings, key/value), otadata, app0/app1 (two app slots for OTA), spiffs/littlefs (files), coredump.
- "Huge APP" schemes give one big app slot and no OTA; "Minimal SPIFFS" gives bigger app slots with OTA.
- Erasing the whole flash wipes nvs too: saved WiFi passwords and settings are lost.

## Reading a .bin
- The app header contains the project name, version, build date and ESP-IDF version.
- Text inside the firmware (log messages, web pages, menu entries, WiFi access point names) tells what the firmware does.
- Library names found inside the binary (TFT_eSPI, LVGL, NimBLE, PubSubClient, FastLED...) tell what hardware it expects: a display, LEDs, MQTT, BLE, LoRa.
- Pin numbers usually can't be read from a compiled binary reliably. Check the project's README or the board's pinout instead.

## Arduino AVR .hex files
- Arduino Uno/Nano/Mega firmware is an Intel HEX file uploaded with avrdude through the bootloader (no offsets needed).
- Flashing a .hex replaces the sketch only; the bootloader stays.
