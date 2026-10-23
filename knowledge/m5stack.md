<!-- boards: m5core,m5core2,m5cores3,m5stickcplus,m5stickcplus2,m5cardputer -->
# M5Stack devices

## M5Stack general advice
- Use the M5Unified library (+ M5GFX). It knows every model's display, buttons, power chip, speaker and IMU, so code works across devices: `auto cfg = M5.config(); M5.begin(cfg);` then `M5.update()` in loop.
- Buttons: M5.BtnA / BtnB / BtnC with wasPressed(), isPressed(), wasHold().
- Display: M5.Display (same API as LovyanGFX: fillScreen, drawString, setTextSize, printf).
- Speaker: M5.Speaker.tone(freq, ms). IMU: M5.Imu.getAccel(&x, &y, &z).
- Grove "Port A" is I2C. Use M5.Ex_I2C or Wire.begin(M5.Ex_I2C.getSDA(), M5.Ex_I2C.getSCL()) so the pins are right for the model.
- Board names in the ESP32 core: m5stack_core, m5stack_core2, m5stack_cores3, m5stack_stickc_plus, m5stack_stickc_plus2, m5stack_cardputer, m5stack_atom.

## M5Stack Core (Basic / Gray / Fire) pinout
- ESP32, 320x240 ILI9342C LCD: MOSI 23, SCK 18, CS 14, DC 27, RST 33, backlight 32.
- Buttons A 39, B 38, C 37. Speaker GPIO 25. microSD CS 4 (shares VSPI 23/19/18).
- Grove Port A (I2C): SDA 21, SCL 22. Port B: GPIO 26, 36. Port C (UART): RX 16, TX 17.
- Fire adds PSRAM (so 16/17 are used) and 10 NeoPixels on GPIO 15.

## M5Stack Core2 pinout
- ESP32 with 8 MB PSRAM, AXP192 power chip, capacitive touch screen; buttons A/B/C are touch zones under the screen.
- Grove Port A: SDA 32, SCL 33. Internal I2C (touch, power, RTC, IMU): SDA 21, SCL 22.
- Speaker is I2S (NS4168): BCLK 12, LRCK 0, DATA 2. Microphone PDM: CLK 0, DATA 34.
- Vibration motor and LCD power go through the AXP192: use M5Unified, raw pins won't turn the screen on.

## M5Stack CoreS3 pinout
- ESP32-S3 with 8 MB PSRAM, AXP2101 power chip, capacitive touch, camera, proximity sensor.
- Grove Port A: SDA 2, SCL 1. Internal I2C: SDA 12, SCL 11.
- Needs "USB CDC On Boot" for Serial over its USB-C port. Use M5Unified.

## M5StickC Plus / Plus2 pinout
- StickC Plus: ESP32-PICO-D4, 135x240 ST7789 LCD, AXP192 power chip. Button A 37 (front), B 39 (side). Red LED 10 (active LOW). IR LED 9. Buzzer 2. Grove: SDA 32, SCL 33. Header: 0, 25/36, 26.
- StickC Plus2: ESP32-PICO-V3-02 with 2 MB PSRAM, no AXP chip. GPIO 4 is the power-hold pin: set it HIGH at start or the stick turns off when you let go of the power button. Buttons A 37, B 39, power button 35. LED and IR both on GPIO 19. Buzzer 2. Grove: SDA 32, SCL 33.
- M5Unified handles the differences (and the Plus2 power hold) for you.

## M5Stack Cardputer pinout
- StampS3 (ESP32-S3), 240x135 ST7789 LCD, 56-key keyboard, speaker, mic, IR, microSD, Grove.
- LCD: MOSI 35, SCK 36, DC 34, RST 33, CS 37, backlight 38.
- microSD: SCK 40, MISO 39, MOSI 14, CS 12. IR LED: 44. Grove: SDA 2, SCL 1.
- Keyboard: use the M5Cardputer library (M5Cardputer.Keyboard.isChange(), keysState()).

## M5Stack Atom Lite / Matrix
- ESP32-PICO. Button GPIO 39. SK6812 RGB LED on GPIO 27 (Matrix: 5x5 LEDs on 27). IR LED 12.
- Grove: SDA 26, SCL 32.
