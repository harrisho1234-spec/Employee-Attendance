# Employee Attendance Dashboard PWA

This repository contains the complete Employee Attendance Dashboard configured as an installable Progressive Web App (PWA).

## 📁 Repository Structure
```text
├── index.html           # Main dashboard web app
├── manifest.json        # PWA configuration
├── sw.js                # Service worker for offline shell
├── icons/
│   ├── icon-192.png     # 192x192 app icon
│   ├── icon-512.png     # 512x512 app icon
│   └── icon.svg         # Scalable vector icon
└── README.md
```

## 🚀 How to Deploy on GitHub Pages

1. Create a new repository on [GitHub](https://github.com) (e.g. `employee-attendance`).
2. Upload or push all files from this directory into the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initialize Attendance App"
   git branch -M main
   git remote add origin https://github.com/<your-username>/employee-attendance.git
   git push -u origin main
   ```
3. Go to **Settings** > **Pages** in your GitHub repository.
4. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
5. Select branch: `main`, folder: `/ (root)`, and click **Save**.
6. In ~1-2 minutes, your app will be live at:
   `https://<your-username>.github.io/<repo-name>/`

## 📲 How to Install the App

- **Android (Chrome / Edge)**: Open the URL, tap `⋮` (menu) > **Install App** or **Add to Home screen**.
- **iOS (Safari)**: Open the URL, tap **Share** (square with up arrow) > **Add to Home Screen**.
- **Desktop (Chrome / Edge)**: Click the **Install** button in the right side of the address bar.
