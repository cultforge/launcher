# CultForge Windows installer customization

## Default install path

| Installer | Path |
|-----------|------|
| NSIS (`.exe`) | `%LOCALAPPDATA%\CultForge` (`installMode: currentUser`) |
| MSI (`.msi`) | `%LOCALAPPDATA%\CultForge` (WiX `LocalAppDataFolder` + `perUser`) |

Users can still change the folder in the install UI.

## Bundled sidecar (`client.exe`)

Freeze the FastAPI sidecar before packaging:

```powershell
npm run sidecar:freeze
```

That writes:

- `dist-sidecar/client.exe`
- `src-tauri/resources/client.exe` (bundled into MSI/NSIS)

The launcher prefers `client.exe` next to the app (or under `resources/`), and still accepts the legacy name `cultforge-sidecar.exe`.

## Deep links (`cultforge://`)

Registered via `tauri-plugin-deep-link` (`plugins.deep-link.desktop.schemes: ["cultforge"]`).

Examples that already navigate in-app:

- `cultforge://home`, `cultforge://settings`, `cultforge://builds`, …
- `cultforge://guild/{id}`, `cultforge://dm/{userId}`, `cultforge://profile/{userId}`
- Optional `nav/` prefix: `cultforge://nav/builds`

WiX/NSIS pick up the scheme from the deep-link plugin config.

## Scripts / hooks

| When | NSIS | MSI |
|------|------|-----|
| Pre-install | Embeds + runs `installer-scripts\pre-install.ps1` (Java 17 Temurin into `%APPDATA%\CultForge\runtimes\java-17`) | Optional `%TEMP%\cultforge-pre-install.ps1`; Java also ensured in post-install |
| Post-install | Re-runs pre-install Java ensure, then GPU/CPU prefs for `javaw.exe` | same |
| Pre-uninstall | `installer-scripts\pre-uninstall.ps1` | (add WiX CA if needed) |

### Java 17

`pre-install.ps1` downloads **Eclipse Temurin JRE 17** (Adoptium) when no suitable `javaw.exe` is found, into the same managed path the launcher uses:

`%APPDATA%\CultForge\runtimes\java-17\` (+ `runtime.json`)

Skips download if Java 17+ is already on PATH / `JAVA_HOME` / that managed folder. Failures do not abort the installer.

### CULTFORGE_HOME + ctfgbroker

Post-install sets **User** env `CULTFORGE_HOME` to the install directory and creates `api\mping.json`.

The launcher bundles `ctfgbroker.exe` and writes guild/user server addresses into `{CULTFORGE_HOME}\api\mping.json`. The broker polls status on `127.0.0.1:8270` (`/query?server=`).

Edit the PowerShell files under `src-tauri/installer-scripts/` — they are bundled as app resources.

## Rebuild

```powershell
npm run sidecar:freeze   # once, or when client.py changes
npm run tauri build
```

Outputs:

- `src-tauri/target/release/bundle/msi/CultForge_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/CultForge_0.1.0_x64-setup.exe`
