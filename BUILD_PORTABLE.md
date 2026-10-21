# Building Portable Windows Executable

## Prerequisites
- Node.js 22.14 or later (`engines.node` in `package.json`) and npm installed
- Windows machine (or Docker for cross-compilation)
- To install dependencies the normal way (see step 1): Python 3, a C++ toolchain
  (on Windows, Visual Studio Build Tools with "Desktop development with C++"; on
  Linux, `make` and a C++ compiler), and access to nodejs.org. `better-sqlite3` ships
  a prebuilt binary and compiles nothing, but npm still runs `node-gyp rebuild` for it
  during install, and node-gyp looks for Python and the toolchain and downloads Node
  headers before it reads the build file. Without them `npm ci` fails.

## Before You Release

Run `node scripts/audit/dependency-triage.mjs` and read its "Desktop Runtime Advisories"
section. Electron ships to every desktop user, so that section must be empty and
`package.json` must name a supported Electron major (the latest three).

## Build Steps

### 1. Install Dependencies
```bash
npm install
```

On a machine without Python and a C++ toolchain, skip the install scripts and run the
project's own post-install step by hand:

```bash
npm ci --ignore-scripts
node scripts/postinstall.cjs
```

This was checked on Linux with Node 22 and no Python, `make` or compiler on the `PATH`:
the build and the unit tests pass, and `better-sqlite3` loads under Node and Electron.
It has not been run on Windows.

### 2. Build the Application
```bash
npm run build
```

### 3. Package as Portable Windows Executable
```bash
npm run package:win
```

This will create a portable .exe file in the `dist/` directory:
- `LumaKeys-0.1.0-portable.exe` (~150-200MB)

## Testing on Restricted UAC PC

### Installation (No UAC Required)
1. Copy `LumaKeys-0.1.0-portable.exe` to the restricted PC via:
   - USB drive
   - Network share
   - Email/cloud download

2. Place the .exe in any user-writable location:
   - Desktop: `C:\Users\<username>\Desktop\`
   - Documents: `C:\Users\<username>\Documents\LumaKeys\`
   - USB drive: `E:\LumaKeys\`

3. Double-click to run - **no installation or UAC prompt required**

### Data Storage Locations
All application data is stored in user-writable directories:
- Database: `%APPDATA%\LumaKeys\lumakeys.db`
- MIDI files: `%APPDATA%\LumaKeys\midi-files\`
- Settings: Stored in database

To view data directory:
1. Press `Win + R`
2. Type `%APPDATA%\LumaKeys`
3. Press Enter

### Verification Checklist
- [ ] Application launches without UAC prompt
- [ ] Database is created in `%APPDATA%\LumaKeys\`
- [ ] Can import MIDI files
- [ ] Can export MIDI files
- [ ] MIDI hardware input works (if keyboard connected)
- [ ] Audio playback works (may require internet on first launch for Tone.js samples)
- [ ] Settings persist after closing and reopening
- [ ] All game modes function correctly
- [ ] Learning modules work
- [ ] Achievements system works

### Troubleshooting

**Issue**: Audio doesn't play on first launch
- **Cause**: Tone.js Salamander piano samples need to download from CDN
- **Solution**: Ensure internet connection on first launch, samples will be cached

**Issue**: "better-sqlite3 not found" error
- **Cause**: Native module not properly bundled
- **Solution**: Reinstall on the Windows machine and package again: `npm ci && npm run package:win` (or the `--ignore-scripts` form in step 1). `better-sqlite3` ships a prebuilt N-API binary that Electron loads directly, so packaging does not rebuild it.

**Issue**: Application won't start
- **Cause**: Missing Visual C++ Redistributable
- **Solution**: Download from Microsoft (doesn't require UAC): https://aka.ms/vs/17/release/vc_redist.x64.exe

## Building on Linux (Cross-Compilation)

If you need to build the Windows portable from Linux:

```bash
# Install Wine (for electron-builder)
sudo apt-get install wine64

# Build Windows portable
npm run package:win
```

Note: Cross-compilation may have issues with native modules. Building on Windows is recommended.

## Optional: Bundle Audio Samples for Offline Use

To create a fully offline-capable portable build:

1. Download Salamander piano samples (~50-100MB)
2. Place in `packaging/resources/audio/salamander/`
3. Modify audio loading code to check local resources first
4. Rebuild with bundled samples

This increases the .exe size to ~250MB but eliminates the need for internet on first launch.

## File Size Reference
- Base portable .exe: ~150-200MB
- With bundled audio samples: ~250-300MB
- Compressed (zip): ~100-150MB

## Distribution
The portable .exe is a single file that can be:
- Shared via USB drive
- Downloaded from a website
- Distributed via network share
- Emailed (if size permits)

No installation wizard, no registry entries, no system files - just run and go!
