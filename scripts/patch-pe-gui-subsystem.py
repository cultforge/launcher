"""Patch Windows PE OptionalHeader.Subsystem CUI(3) → GUI(2) so helpers never allocate a console."""
from __future__ import annotations

import struct
import sys
from pathlib import Path


def patch_subsystem_gui(path: Path) -> str:
    data = bytearray(path.read_bytes())
    if data[:2] != b"MZ":
        raise SystemExit(f"not a PE: {path}")
    pe_off = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe_off : pe_off + 4] != b"PE\0\0":
        raise SystemExit(f"bad PE signature: {path}")
    magic = struct.unpack_from("<H", data, pe_off + 0x18)[0]
    # PE32 = 0x10B, PE32+ = 0x20B — Subsystem is at +0x5C from PE header start
    # (same for both: FileHeader 20 bytes + OptionalHeader offset 68 for Subsystem).
    sub_off = pe_off + 0x5C
    old = struct.unpack_from("<H", data, sub_off)[0]
    if old == 2:
        return f"{path.name}: already GUI (2)"
    if old != 3:
        return f"{path.name}: subsystem={old} (left unchanged)"
    struct.pack_into("<H", data, sub_off, 2)
    path.write_bytes(data)
    return f"{path.name}: subsystem {old} → 2 (GUI) magic=0x{magic:X}"


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: patch-pe-gui-subsystem.py <exe> [exe...]")
    for arg in sys.argv[1:]:
        print(patch_subsystem_gui(Path(arg)))


if __name__ == "__main__":
    main()
