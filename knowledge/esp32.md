<!-- boards: esp32 -->
# ESP32 (classic) - ESP32-WROOM-32 / DevKit V1 / DevKitC

## ESP32 pinout and safe pins
- Dual-core Xtensa LX6, 240 MHz, 520 KB SRAM, WiFi 2.4 GHz + Bluetooth Classic + BLE.
- Logic is 3.3 V. GPIOs are NOT 5 V tolerant. Recommended max ~20 mA per pin (absolute max 40 mA).
- Safe general purpose pins: 4, 13, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33.
- Input only (no output, no internal pull-up/down): 34, 35, 36 (VP), 39 (VN).
- Do not use 6, 7, 8, 9, 10, 11: wired to the SPI flash chip. Using them crashes the board.
- GPIO 1 (TX0) and 3 (RX0) are the USB serial port (Serial). Avoid them if you use Serial Monitor or upload.
- On WROVER modules (with PSRAM) GPIO 16 and 17 are used by PSRAM.

## ESP32 strapping pins (boot behaviour)
- GPIO 0: LOW at reset = download (flash) mode. HIGH/floating = run firmware. This is the BOOT button.
- GPIO 2: must be LOW or floating to enter download mode. Many DevKits have the blue LED on GPIO 2.
- GPIO 12 (MTDI): sets flash voltage. If pulled HIGH at boot the board fails with "flash read err". Don't put pull-ups on GPIO 12.
- GPIO 15 (MTDO): HIGH at boot. Pulling it LOW silences the boot log.
- GPIO 5: must be HIGH at boot.
- Rule: don't connect things that pull 0, 2, 5, 12, 15 to a fixed level during reset.

## ESP32 ADC, DAC, touch, PWM
- ADC1: GPIO 32, 33, 34, 35, 36, 37, 38, 39. Works with WiFi on.
- ADC2: GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27. ADC2 cannot be used while WiFi is active. Use ADC1 pins for analog with WiFi.
- analogRead() returns 0-4095 (12 bit). It is not linear near 0 V and 3.3 V; use analogReadMilliVolts() for calibrated mV.
- DAC (true analog out): GPIO 25 and 26, dacWrite(pin, 0-255).
- Capacitive touch: T0=4, T1=0, T2=2, T3=15, T4=13, T5=12, T6=14, T7=27, T8=33, T9=32. touchRead(pin), lower value = touched.
- PWM (LEDC) works on any output pin, 16 channels.

## ESP32 default buses (Arduino core)
- I2C (Wire): SDA 21, SCL 22. Any pins can be used: Wire.begin(SDA, SCL).
- VSPI (default SPI): MOSI 23, MISO 19, SCK 18, SS 5.
- HSPI: MOSI 13, MISO 12, SCK 14, SS 15.
- UART0 (Serial): TX 1, RX 3. UART2 (Serial2): default TX 17, RX 16, remappable: Serial2.begin(115200, SERIAL_8N1, RX, TX).
- Deep-sleep wake pins (RTC GPIO): 0, 2, 4, 12-15, 25-27, 32-39.

## ESP32 power
- Powered from USB 5 V or the 5V/VIN pin (onboard regulator to 3.3 V). Or 3.3 V directly on 3V3 (regulated only, never more than 3.6 V).
- WiFi transmit peaks are ~300-500 mA. Weak USB ports or cables cause "Brownout detector was triggered".
- Deep sleep draws ~10 uA on the chip, but DevKit boards draw more because of the regulator and USB chip.
