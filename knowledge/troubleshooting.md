<!-- boards: -->
# Troubleshooting

## Upload and flashing errors
- "Failed to connect to ESP32: No serial data received" / "Wrong boot mode": the chip isn't in download mode. Hold BOOT, tap RESET (EN), release BOOT, then flash. On some boards hold BOOT during the whole "Connecting..." phase.
- "Could not open port" / "Access is denied": another program has the COM port open (Serial Monitor, Arduino IDE, Cura, another VoltFlash).
- No COM port appears: charge-only USB cable (very common), or missing driver: CP210x (Silicon Labs) or CH340/CH9102 (WCH). Try another cable and port.
- "A fatal error occurred: Timed out waiting for packet header": lower the baud to 115200 or 460800, use a shorter cable.
- "This chip is ESP32-S3, not ESP32": firmware built for another chip; pick the matching file/board.
- Arduino Nano "stk500_getsync(): not in sync": pick the old bootloader option.

## Boot loops and crashes (serial log messages)
- "Brownout detector was triggered": not enough power. Use a better cable/port, a powered hub, or a capacitor (100-470 uF) across 3.3V/GND. Big loads (LEDs, motors) need their own supply.
- "flash read err, 1000" or "invalid header: 0xffffffff": GPIO 12 pulled high at boot, wrong flash mode, or nothing flashed at the right offset. Erase flash and flash a full/merged image at 0x0.
- "Guru Meditation Error: Core 1 panic'ed (LoadProhibited)": the code used a null or invalid pointer (e.g. an object not begun, out-of-range array).
- "Stack canary watchpoint triggered" / "stack overflow": a task's stack is too small or a big array lives on the stack; make it static/global or increase the task stack.
- "Task watchdog got triggered" / "TG1WDT_SYS_RESET": something blocked too long (endless while loop without delay). Add delay(1)/yield().
- "rst:0xc (SW_CPU_RESET)" right after start repeatedly: firmware calls ESP.restart() or crashes early; read the lines before it.
- Board resets when WiFi starts: power problem (see brownout).

## Compile errors (Arduino)
- "xxx.h: No such file or directory": library not installed. Install it from Libraries with the exact name.
- "'ledcSetup' was not declared in this scope": code written for ESP32 core 2.x; in 3.x use ledcAttach(pin, freq, bits) and ledcWrite(pin, duty).
- "Sketch too big" / "text section exceeds available space": choose a bigger partition scheme (Huge APP), remove libraries, or a board with more flash.
- "multiple definition of ...": the same function/variable defined in two files or two libraries with the same file names.
- "was not declared in this scope": typo, missing #include, or a function used before it's declared (declare it above, or move it).
- TFT_eSPI shows nothing on CYD: User_Setup.h not edited for the CYD pins.

## Runtime problems
- Serial Monitor shows garbage: baud rate mismatch (ESP32 boot messages are at 115200; set the sketch and monitor to the same baud).
- ESP32-S3 prints nothing: enable "USB CDC On Boot" or use the UART USB port.
- analogRead always 4095 or 0 with WiFi on: ADC2 pin; move to an ADC1 pin.
- WiFi won't connect: 5 GHz network (ESP32 only does 2.4 GHz), wrong password, or captive portal network.
- I2C device not found: wrong SDA/SCL pins, missing GND, wrong address (run an I2C scanner), 5 V-only module.
