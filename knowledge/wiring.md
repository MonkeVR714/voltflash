<!-- boards: -->
# Wiring common parts

## Wiring basics and safety
- Always connect GND between the board and every module.
- ESP32 pins are 3.3 V only. A 5 V signal INTO an ESP32 pin needs a level shifter or a voltage divider (1 kOhm from the signal, 2 kOhm to GND, take the middle).
- Don't power motors, servos, relays or LED strips from a GPIO. Use the 5V/VIN pin (small loads) or a separate supply with a shared GND.
- LED on a pin: always a resistor in series (220-330 Ohm for 3.3 V / 5 V).
- Buttons: wire between the pin and GND, use INPUT_PULLUP. No resistor needed.
- I2C devices can share the same two wires (SDA, SCL) as long as their addresses differ. Most modules have pull-ups already.

## I2C sensors and displays
- SSD1306 OLED 128x64: VCC 3.3V, GND, SDA, SCL. Address 0x3C (sometimes 0x3D). Libraries: Adafruit_SSD1306 or U8g2.
- BME280 / BMP280 (temp, humidity, pressure): VCC 3.3V, address 0x76 or 0x77. Library: Adafruit_BME280. BMP280 has no humidity.
- MPU6050 (accel/gyro): 3.3V, address 0x68. AHT20 / AHT10: 0x38. SHT31: 0x44. VL53L0X distance: 0x29. DS3231 RTC: 0x68. ADS1115 ADC: 0x48. PCF8574 LCD backpack: 0x27 or 0x3F.
- 16x2 LCD with I2C backpack: needs 5 V for contrast; works on ESP32 data lines in most cases. Library LiquidCrystal_I2C.

## Other common sensors
- DHT11 / DHT22: data pin to any GPIO with a 10k pull-up to 3.3V (modules have it). Read at most every 2 s. Library: "DHT sensor library" by Adafruit.
- DS18B20 (1-Wire temperature): data pin + 4.7k pull-up to 3.3V. Libraries OneWire + DallasTemperature. Many sensors can share one pin.
- HC-SR04 ultrasonic: needs 5 V power; its ECHO output is 5 V, so put a divider (1k/2k) before the ESP32 pin. Or use the 3.3 V HC-SR04P version.
- PIR (HC-SR501): 5 V power, output is 3.3 V, safe for ESP32 directly.
- Soil moisture (capacitive v1.2): analog out to an ADC1 pin (ESP32: 32-39).
- Potentiometer: outer legs to 3.3V and GND, middle to an ADC1 pin.
- GPS modules (NEO-6M): UART, TX of GPS -> RX of the board. Serial2.begin(9600, SERIAL_8N1, RX, TX). Library TinyGPSPlus.

## Outputs: LEDs, relays, servos, motors
- WS2812B / NeoPixel strips: 5 V power from a supply sized ~60 mA per LED at full white; data from any GPIO through a 330 Ohm resistor. 3.3 V data usually works; for long strips use a level shifter (74AHCT125). Libraries: Adafruit_NeoPixel or FastLED.
- Relay modules: use 5 V relay modules with optocoupler; many trigger on LOW. Never switch mains voltage without proper enclosure and knowledge.
- Servo (SG90): power from 5 V (not the 3.3V pin), signal to a GPIO. Library ESP32Servo on ESP32 (Servo.h on AVR).
- DC motors: need a driver (L298N, TB6612FNG, DRV8833). Never drive a motor from a pin directly.
- Stepper 28BYJ-48 with ULN2003 board: 4 GPIOs + 5 V supply. Library Stepper or AccelStepper.
- Passive buzzer: tone(pin, freq). Active buzzer: just digitalWrite HIGH.

## Displays over SPI
- ILI9341 / ST7789 / ST7735 TFTs: SCK, MOSI, CS, DC, RST (+ BL). Use TFT_eSPI (edit User_Setup.h) or LovyanGFX / Adafruit_GFX.
- e-paper (GxEPD2 library): BUSY, RST, DC, CS, SCK, MOSI. Uses 3.3 V.
