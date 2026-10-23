# VoltFlash

A Windows app in the spirit of M5Burner: browse firmware by board, download it from GitHub and flash it over USB. It also has a built-in web browser, a mini Arduino IDE and a serial monitor.

## Install

**Easiest (works on every Windows 10/11 PC, including ones with Smart App Control):** open PowerShell and paste:

```powershell
irm https://raw.githubusercontent.com/MonkeVR714/voltflash/main/install.ps1 | iex
```

This installs VoltFlash for your user account (no admin needed). It adds Start menu and desktop shortcuts and puts VoltFlash in **Settings > Apps** so you can uninstall it.

**Or download from [Releases](https://github.com/MonkeVR714/voltflash/releases/latest):**

| File | What it is |
|---|---|
| `VoltFlash-Setup-x.y.z.exe` | One-click installer. Windows may block it if Smart App Control is on, so use the PowerShell line above in that case. |
| `VoltFlash-Portable-x.y.z.exe` | Single file, no install. Doesn't update itself. |

### Updates

VoltFlash checks GitHub for a new release when it starts and every 6 hours after that. New versions download in the background, and a **Restart to update** button appears in the status bar. Copies installed with the PowerShell line only replace the app's own files, so Windows keeps trusting the program. You can turn auto-check off in **Settings > Updates**.

## Features

- **AI Assistant (local, free):** chat with a model running on your own PC through [Ollama](https://ollama.com). It knows ESP32, ESP32-S3/C3, CYD, M5Stack and Arduino pinouts, wiring for common parts, Arduino-ESP32 code and the usual fixes; these come from the knowledge pack in `knowledge/`. **Explain .bin** reads a firmware file (chip, partitions, compiled-in libraries, text, URLs) and explains what it does and how to wire it. It writes code you can send **To IDE**, and you can ask it about compile errors or serial output. Default model: `qwen2.5-coder:3b` (about 2 GB), which VoltFlash downloads for you.
- **Pinouts:** safe pins, strapping pins, ADC/touch/buses for every supported board, plus pages for parts wiring, fixes, code and libraries.
- **Serial Plotter:** tick **Plot** in the Serial Monitor to graph numbers live (`12 34` or `temp:21.5,hum:40`).
- **Flash history** and **Erase board** on the Backups page.

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
