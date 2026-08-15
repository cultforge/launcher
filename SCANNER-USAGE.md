# Usage

Run the scanner, then send commands to it as JSON lines on standard input.
the path in the arguements can be C:\\Users\\arcad\\AppData\\Roaming\\.minecraft\\versions\\1.20.1\\mods
etc....

## Start the scanner

```powershell
scanner.exe
```

## Send a command

Type one JSON-RPC command per line:

```json
{"jsonrpc":"2.0","id":1,"method":"scan_mods","params":{"path":"C:\\mods"}}
```

## Common commands

### Scan mods in a folder

```json
{"jsonrpc":"2.0","id":2,"method":"scan_mods","params":{"path":"C:\\mods"}}
```

### Scan a single mod file

```json
{"jsonrpc":"2.0","id":3,"method":"scan_mod","params":{"path":"C:\\mods\\SomeMod.jar"}}
```

### Scan a world folder

```json
{"jsonrpc":"2.0","id":4,"method":"scan_world","params":{"path":"C:\\saves\\MyWorld"}}
```

### Scan builds from a root folder

```json
{"jsonrpc":"2.0","id":5,"method":"scan_builds","params":{"root":"C:\\path\\to\\your\\minecraft\\folder"}}
```

## Notes

- Send only one JSON command per line.
- Replace the example paths with real paths on your machine.
- The scanner will print its responses and events to stdout.
