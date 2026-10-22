// Lists COM ports through Windows PnP so no native serial module is needed.
const { powershell } = require('./proc');

// USB-serial bridges commonly found on ESP32 / Arduino boards.
const KNOWN = {
  '10C4:EA60': 'CP210x',
  '10C4:EA70': 'CP2105',
  '1A86:7523': 'CH340',
  '1A86:55D4': 'CH9102',
  '1A86:55D3': 'CH343',
  '0403:6001': 'FTDI',
  '0403:6010': 'FTDI dual',
  '0403:6015': 'FTDI',
  '303A:1001': 'ESP32 native USB',
  '303A:0002': 'ESP32-S2 native USB',
  '2341:0043': 'Arduino Uno',
  '2341:0001': 'Arduino Uno',
  '2341:0042': 'Arduino Mega',
  '2341:0010': 'Arduino Mega',
  '2341:8036': 'Arduino Leonardo',
  '2341:0036': 'Arduino Leonardo',
  '2A03:0043': 'Arduino Uno',
};

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_PnPEntity |
  Where-Object { $_.Name -match '\\(COM\\d+\\)' } |
  Select-Object Name, DeviceID, Manufacturer, Status |
  ConvertTo-Json -Compress
`;

async function list() {
  const r = await powershell(SCRIPT);
  const text = r.out.trim();
  if (!text) return [];
  let rows = JSON.parse(text);
  if (!Array.isArray(rows)) rows = [rows];
  return rows
    .map((row) => {
      const port = (row.Name.match(/\((COM\d+)\)/) || [])[1];
      const vid = (row.DeviceID.match(/VID_([0-9A-F]{4})/i) || [])[1];
      const pid = (row.DeviceID.match(/PID_([0-9A-F]{4})/i) || [])[1];
      const key = vid && pid ? `${vid}:${pid}`.toUpperCase() : null;
      const chip = (key && KNOWN[key]) || (vid && vid.toUpperCase() === '2341' ? 'Arduino' : null);
      const label = row.Name.replace(/\s*\(COM\d+\)\s*$/, '');
      return {
        port,
        label,
        chip,
        vid,
        pid,
        manufacturer: row.Manufacturer,
        usb: !!vid,
        likelyBoard: !!chip,
        ok: row.Status === 'OK',
      };
    })
    .filter((p) => p.port)
    .sort((a, b) => Number(b.likelyBoard) - Number(a.likelyBoard) || Number(a.port.slice(3)) - Number(b.port.slice(3)));
}

module.exports = { list, KNOWN };
