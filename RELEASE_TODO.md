Yep. Since you have the **Tauri source open in Cursor on Windows**, you can set this up directly from there.

**Status:** `.github/workflows/release.yml` is in the repo (tag `v*` → Windows / Ubuntu / macOS draft release). See `docs/github-actions-release.md`.

I’d recommend **GitHub Actions + Tauri Action** so every release automatically produces Windows, Linux, and macOS installers.

### 1. Put your project on GitHub

From Cursor's terminal:

```bash
git init
git add .
git commit -m "Initial CultForge launcher"
```

Create a repository on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

### 2. Create the GitHub Actions folder

In Cursor, create:

```text
.github/
└── workflows/
    └── release.yml
```

Put this in `release.yml`:

```yaml
name: Build CultForge

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            args: ""

          - platform: ubuntu-22.04
            args: ""

          - platform: macos-latest
            args: ""

    runs-on: ${{ matrix.platform }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt update
          sudo apt install -y \
            libwebkit2gtk-4.1-dev \
            build-essential \
            curl \
            wget \
            file \
            libxdo-dev \
            libssl-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install frontend dependencies
        run: npm ci

      - name: Build Tauri
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "CultForge ${{ github.ref_name }}"
          releaseBody: "CultForge Launcher release."
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

---

### 3. Commit and push it

```bash
git add .github/workflows/release.yml
git commit -m "Add cross-platform release builds"
git push
```

Nothing builds yet because we told GitHub to build **when you create a version tag**.

---

### 4. Create your first release

For example:

```bash
git tag v2.4.1
git push origin v2.4.1
```

Then go to:

**GitHub → your repository → Actions**

You'll see:

```text
Build CultForge
      │
      ├── Windows
      ├── Ubuntu
      └── macOS
```

GitHub will provision those machines and compile your Tauri project.

---

### 5. When it finishes

Your GitHub Release will contain the generated installers.

Something along the lines of:

```text
CultForge v2.4.1
│
├── Windows
│   ├── CultForge_2.4.1_x64-setup.exe
│   └── CultForge_2.4.1_x64_en-US.msi
│
├── Linux
│   ├── CultForge_2.4.1_amd64.AppImage
│   └── cultforge_2.4.1_amd64.deb
│
└── macOS
    └── CultForge_2.4.1_x64.dmg
```

The exact filenames depend on your Tauri configuration.

---

### One thing I'd change for CultForge

Don't trigger builds on every push.

Use:

```text
push → normal development
       ↓
    merge/test
       ↓
   git tag v2.4.1
       ↓
GitHub Actions
       ↓
Windows + Linux + macOS
       ↓
GitHub Release
```

That makes your release process **extremely clean**.

And later we can connect this directly to your **CultForge website/launcher updater**, so when you publish `v2.4.2`, the launcher can detect it and update itself.
