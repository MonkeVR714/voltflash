<!-- boards: uno,nano,nanoold,mega,leonardo -->
# Arduino AVR boards (Uno, Nano, Mega, Leonardo)

## Arduino Uno pinout
- ATmega328P, 16 MHz, 5 V logic. 32 KB flash, 2 KB RAM, 1 KB EEPROM.
- Digital 0-13, analog A0-A5 (also usable as digital 14-19). analogRead 0-1023 (10 bit, 0-5 V).
- PWM (analogWrite): 3, 5, 6, 9, 10, 11.
- Serial: 0 (RX), 1 (TX), shared with USB; don't connect things there while uploading.
- I2C: SDA A4, SCL A5. SPI: MOSI 11, MISO 12, SCK 13, SS 10.
- External interrupts: pins 2 and 3 (attachInterrupt(digitalPinToInterrupt(2), isr, FALLING)).
- LED_BUILTIN = 13. Max 20 mA per pin recommended (40 mA absolute), 200 mA total.
- 5V pin can supply ~400-500 mA from USB; 3.3V pin only ~50 mA.

## Arduino Nano pinout
- Same chip as Uno (ATmega328P), same pin numbers, plus A6 and A7 which are analog input only.
- Many clones use a CH340 USB chip and the old bootloader: pick "Arduino Nano (old bootloader)" if upload fails with "not in sync".

## Arduino Mega 2560 pinout
- ATmega2560, 5 V, 256 KB flash, 8 KB RAM. Digital 0-53, analog A0-A15.
- PWM: 2-13 and 44-46. Serial ports: Serial (0/1), Serial1 (19 RX/18 TX), Serial2 (17/16), Serial3 (15/14).
- I2C: SDA 20, SCL 21. SPI: MOSI 51, MISO 50, SCK 52, SS 53.
- Interrupt pins: 2, 3, 18, 19, 20, 21.

## Arduino Leonardo pinout
- ATmega32U4 with native USB (can act as a keyboard/mouse: Keyboard.h, Mouse.h).
- I2C: SDA 2, SCL 3. SPI only on the 6-pin ICSP header. Serial1 = pins 0/1; Serial = USB.

## Arduino vs ESP32 differences
- AVR boards are 5 V logic; ESP32 is 3.3 V. Connecting a 5 V output to an ESP32 pin can damage it: use a level shifter or voltage divider (e.g. 1k + 2k).
- AVR has no WiFi/Bluetooth and very little RAM: avoid String in long-running code, use F("text") for constant strings.
- ESP32 int is 32-bit; on AVR int is 16-bit (-32768..32767). Use long / uint32_t for millis() values.
