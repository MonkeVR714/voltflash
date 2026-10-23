<!-- boards: cyd,cyd2usb -->
# CYD - Cheap Yellow Display (ESP32-2432S028R)

## CYD overview
- Classic ESP32 (ESP32-WROOM-32, 4 MB flash, no PSRAM) with a 2.8" 320x240 TFT, resistive touch, microSD slot, RGB LED, light sensor (LDR) and speaker connector.
- Display driver: ILI9341 on the original micro-USB board. The "2-USB" variant (micro-USB + USB-C) uses ST7789: needs ST7789 driver and inverted colours (tft.invertDisplay(1)).
- Upload with board "ESP32 Dev Module". BOOT button = GPIO 0.
- Reference project with examples: github.com/witnessmenow/ESP32-Cheap-Yellow-Display

## CYD pinout
- Display (HSPI): MISO 12, MOSI 13, SCK 14, CS 15, DC 2, RST tied to EN (-1), backlight 21 (HIGH = on).
- Touch XPT2046 (its own SPI): IRQ 36, MOSI 32, MISO 39, CLK 25, CS 33.
- microSD (VSPI): CS 5, MOSI 23, MISO 19, SCK 18.
- RGB LED: red 4, green 16, blue 17. Active LOW (digitalWrite LOW = on).
- Light sensor (LDR): GPIO 34 (analogRead).
- Speaker connector (P4): GPIO 26 through a small amplifier (use dacWrite or I2S DAC mode).
- Free pins for your own parts:
  - CN1 connector: GPIO 22, GPIO 27, 3.3 V, GND. Best place for an I2C sensor: SDA 27, SCL 22 -> Wire.begin(27, 22).
  - P3 connector: GPIO 35 (input only), GPIO 22, GPIO 21 (21 is also the backlight, avoid).
  - P1 connector: TX/RX of Serial (GPIO 1, 3) and 5 V/GND.
- Battery connector exists but there is no charger on the board.

## CYD TFT_eSPI setup
TFT_eSPI needs its User_Setup.h edited (in the library folder) for the CYD:
```
#define ILI9341_2_DRIVER     // ST7789_DRIVER for the 2-USB board
#define TFT_WIDTH  240
#define TFT_HEIGHT 320
#define TFT_BL   21
#define TFT_BACKLIGHT_ON HIGH
#define TFT_MISO 12
#define TFT_MOSI 13
#define TFT_SCLK 14
#define TFT_CS   15
#define TFT_DC    2
#define TFT_RST  -1
#define USE_HSPI_PORT
#define SPI_FREQUENCY  55000000
#define SPI_READ_FREQUENCY 20000000
#define SPI_TOUCH_FREQUENCY 2500000
#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define SMOOTH_FONT
```
- Touch uses the XPT2046_Touchscreen library on its own SPIClass: `SPIClass touchSpi(VSPI); touchSpi.begin(25, 39, 32, 33); touch.begin(touchSpi);`
- Raw touch values are roughly x 200-3700, y 240-3800; map() them to 0-320 / 0-240 and calibrate per board.
- LovyanGFX is an alternative that needs no User_Setup edit (configure in code).

## CYD common problems
- White or blank screen: wrong driver (ILI9341 vs ST7789) or USE_HSPI_PORT missing.
- Colours inverted or wrong: 2-USB board, call tft.invertDisplay(1) or set TFT_RGB_ORDER.
- Touch not working: touch is on different pins than the display; don't share the display SPI.
- SD card and display together: SD is on VSPI, display on HSPI, so both work at once.
