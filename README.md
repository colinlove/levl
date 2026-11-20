# levl

A minimalist, high-precision spirit level web app built for mobile (iOS Safari, Android Chrome) and modern browsers.

![levl icon](icon.svg)

## Features

- **Dual-Mode Precision Sensing**:
  - **Surface / Bullseye Mode** (Flat on a table): 2D reticle circle with moving bubble indicating both pitch and roll simultaneously.
  - **Edge / Vertical Mode** (Against a wall or shelf): Automatically switches when held upright in portrait or landscape orientations to display a linear vial level for leveling picture frames, shelves, and vertical surfaces.
- **Single Decimal Place Readout**: High-contrast, clean angle readout (e.g., `0.0°`, `1.4°`) with secondary Pitch and Roll indicators.
- **Haptic & Audio Feedback**: Tactile vibration and subtle acoustic ping when reaching dead level (`≤ 0.3°`).
- **Surface Calibration (Zeroing)**: Tap **ZERO** to calibrate out camera bumps, phone cases, or uneven references.
- **Screen Wake Lock**: Keeps the screen awake while leveling so your display doesn't dim or lock mid-measurement.
- **PWA Ready**: Can be installed to the home screen ("Add to Home Screen") for a full-screen, native app experience without browser bars.
- **Desktop Simulation**: Moving the mouse / dragging simulates angle changes for quick preview and testing on laptops/desktops.

---

## Deployment to GitHub Pages (`username.github.io/levl`)

Follow these simple steps to put **levl** live on your GitHub Pages:

### Step 1: Create a repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Set the repository name to `levl` (or any name you prefer).
3. Keep it **Public** (required for free GitHub Pages).
4. Do **not** initialize with a README, .gitignore, or license (we already have local files).
5. Click **Create repository**.

### Step 2: Push your local files to GitHub
Run the following commands in this directory (`c:\Users\Colin\Documents\AG\Levl`):

```bash
# Add your GitHub repository as remote (replace YOUR-USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR-USERNAME/levl.git

# Set the default branch to main
git branch -M main

# Push the code
git push -u origin main
```

*(If you use GitHub CLI `gh`, you can also just run: `gh repo create levl --public --source=. --remote=origin --push`)*

### Step 3: Enable GitHub Pages
1. On GitHub, navigate to your repository's **Settings** tab.
2. In the left sidebar, click **Pages** (under the "Code and automation" section).
3. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
4. Under **Branch**, choose `main` and folder `/(root)`, then click **Save**.
5. Within 1–2 minutes, GitHub will publish your site at:
   ```
   https://YOUR-USERNAME.github.io/levl/
   ```

> **Note on Mobile Permissions & HTTPS**: Motion sensors (`DeviceOrientationEvent` and accelerometer) require a secure HTTPS connection on modern mobile browsers. GitHub Pages automatically provides HTTPS out of the box!
