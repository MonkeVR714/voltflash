# VoltFlash

A Windows app in the spirit of M5Burner: browse firmware by board, download it from GitHub and flash it over USB. It also has a built-in web browser, a mini Arduino IDE and a serial monitor.

## Features

- **Firmware Store**: categories for ESP32, ESP32-S3, CYD (Cheap Yellow Display), M5Stack and Arduino. Each card lists a project's GitHub releases and suggests the right file for the category and the detected chip.
- **Smart flashing**: reads the `.bin` to tell full images (flash at `0x0`) from app-only images (`0x10000`), shows which chip it was built for, and warns when that does not match the board you plugged in. Arduino `.hex` files flash through avrdude.
- **My Projects**: add any GitHub repo, a `.bin` on your PC, or a sketch you built in the IDE. Projects show up next to the built-in ones.
- **Browser**: browse GitHub and docs in the app. Downloaded `.bin`/`.hex` files can be flashed with one click, and GitHub repo pages get a "Flash from releases" bar.
- **Arduino IDE**: Monaco editor, templates (Blink, WiFi scanner, web server, CYD LED/touch, M5Unified), board picker, Verify/Upload, the Library Manager and "Add build to Store".
- **Firmware backups**: before every flash, VoltFlash reads the board's whole flash chip and saves it. The **Backups** page groups the saved images by board (chip and MAC address) and restores any of them with one click. You can also back up a board without flashing.
- **Serial Monitor**: baud picker, timestamps, line endings, command history and a board reset button.
- Hot-plug detection with names for common USB chips (CP210x, CH340, CH9102, FTDI, ESP native USB), plus drag and drop of firmware files anywhere on the window.

esptool and arduino-cli download from their official GitHub releases on first use. Board packages are installed from inside the app.

## Run from source

```bash
npm install
npm start
```

## Build the .exe

```bash
npm run dist
```

Output in `dist/`: `VoltFlash-Setup-1.0.0.exe` (installer) and `VoltFlash-Portable-1.0.0.exe` (single file, no install).

To bundle the tools instead of downloading them, put `esptool.exe` and `arduino-cli.exe` in `resources/bin/` before building.

### Build on GitHub

`.github/workflows/build.yml` builds the installer on GitHub's Windows runners. Push a tag (`git tag v1.0.0 && git push --tags`) and the `.exe` files are attached to a new Release. You can also start it by hand from the Actions tab.

### Smart App Control

Windows 11 PCs with Smart App Control turned on block unsigned programs, and that includes this installer. electron-builder also can't build the installer on such a PC, because it has to run the unsigned uninstaller stub during the build. On those PCs, run the app from an unpacked folder that keeps Electron's original exe unmodified:

```bash
npx electron-builder --win dir --config.win.signAndEditExecutable=false --config.asar=false
```

Then run `dist/win-unpacked/VoltFlash.exe`. The only real fix for distribution is a code-signing certificate.

## Sharing a catalog

`catalog.json` is the built-in store. Host your own copy (for example on GitHub) and set its raw URL in **Settings > Firmware catalog**. Each entry looks like this:

```json
{
  "id": "nerdminer",
  "name": "NerdMiner v2",
  "author": "BitMaker-hub",
  "repo": "BitMaker-hub/NerdMiner_v2",
  "categories": ["cyd", "esp32"],
  "tags": ["Display"],
  "description": "...",
  "assetPattern": "_factory\\.bin$",
  "prefer": { "cyd": "2432S028R_factory", "default": "devKitv1" },
  "offset": 0,
  "fqbn": "arduino:avr:uno"
}
```

`assetPattern` filters a release's files, and `prefer` chooses the default per category. `offset` forces a flash address. `fqbn` picks the board for `.hex` files.

## Layout

```
main.js            window, IPC, browser downloads, Web Serial permissions
preload.js         safe API exposed to the UI
src/main/          esptool + arduino-cli wrappers, GitHub, ports, sketches, settings
renderer/          UI (store, flash dialog, browser, IDE, serial monitor, settings)
catalog.json       built-in firmware store
```
