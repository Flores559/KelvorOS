KELVOROS BRANDING PACKAGE

CONTENTS
assets/kelvor-logo.png       Main transparent Kelvor logo
assets/icon.icns             macOS application icon
assets/icon.ico              Windows application icon
assets/icons/                Extra PNG icon sizes

INSTALL
1. Unzip this package.
2. Drag the included "assets" folder into the main KelvorOS folder.
3. Your project should look like:

KelvorOS/
├── assets/
│   ├── kelvor-logo.png
│   ├── icon.icns
│   ├── icon.ico
│   └── icons/
├── src/
├── main.js
└── package.json

SHOW THE LOGO IN HTML
Add this where you want the logo to appear:

<img src="../assets/kelvor-logo.png" alt="Kelvor" class="kelvor-logo">

If your HTML file is in the project root, use:

<img src="./assets/kelvor-logo.png" alt="Kelvor" class="kelvor-logo">

OPTIONAL CSS
.kelvor-logo {
  width: 120px;
  height: 120px;
  object-fit: contain;
  filter: drop-shadow(0 0 18px rgba(255, 30, 45, 0.55));
}

GITHUB COMMIT MESSAGE
Add Kelvor branding assets and application icons
