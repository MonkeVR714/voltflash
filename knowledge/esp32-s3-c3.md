<!-- boards: esp32s3,esp32s3cdc -->
# ESP32-S3

## ESP32-S3 pinout and safe pins
- Dual-core Xtensa LX7, 240 MHz, WiFi 2.4 GHz + BLE 5 (no Bluetooth Classic), native USB, AI vector instructions.
- 3.3 V logic, not 5 V tolerant.
- GPIO 0-21 and 35-48 exist on modules. Safe general use: 1, 2, 4-18, 21, 38-42 (check your board).
- Do not use 26-32: SPI flash / PSRAM.
- On octal PSRAM modules (N8R8, N16R8, N32R8) GPIO 33-37 are also used by PSRAM. Avoid them.
- Native USB: GPIO 19 (D-) and 20 (D+). Don't use them if you use the USB port.
- UART0 (Serial on the UART USB port): TX 43, RX 44.
- RGB LED on DevKitC-1: GPIO 48 (v1.0) or GPIO 38 (v1.1). It's a WS2812, use neopixelWrite(pin, r, g, b).

## ESP32-S3 strapping pins
- GPIO 0: LOW at reset = download mode (BOOT button).
- GPIO 3: JTAG source select. GPIO 45: flash voltage. GPIO 46: boot mode / ROM log. Leave 3, 45, 46 unconnected at boot.

## ESP32-S3 ADC, touch, buses
- ADC1: GPIO 1-10. ADC2: GPIO 11-20. Prefer ADC1 when WiFi is on.
- Touch: GPIO 1-14. No DAC on S3.
- Default I2C (Arduino): SDA 8, SCL 9. Default SPI (FSPI): MOSI 11, MISO 13, SCK 12, SS 10.
- Any GPIO can be routed to I2C/SPI/UART through the GPIO matrix.

## ESP32-S3 USB and Serial
- With "USB CDC On Boot: Enabled" (fqbn option CDCOnBoot=cdc) Serial goes to the native USB port. If Serial Monitor shows nothing on an S3, this setting is the usual cause.
- If the native USB port stops showing up (crashing firmware), hold BOOT, press RESET, release BOOT to force download mode.

<!-- boards: esp32c3 -->
# ESP32-C3

## ESP32-C3 pinout
- Single-core RISC-V 160 MHz, WiFi 2.4 GHz + BLE 5. 3.3 V logic.
- GPIO 0-10 and 18-21 usable. GPIO 12-17 are used by SPI flash on most modules, don't use them.
- Native USB: GPIO 18 (D-), 19 (D+). UART0: TX 21, RX 20.
- Strapping: GPIO 2 (keep HIGH at boot), GPIO 8 (keep HIGH for download mode), GPIO 9 (BOOT button, LOW = download).
- ADC1: GPIO 0-4. ADC2: GPIO 5 (not usable with WiFi).
- Default I2C: SDA 8, SCL 9. Default SPI: MOSI 7, MISO 2, SCK 6, SS 10.
- ESP32-C3 SuperMini boards: onboard LED usually GPIO 8 (active LOW).
