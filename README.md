# Lucky Number Matcher

PCSO lotto history scanner for 6/58 and 6/42 draws.

---

## Deploy to GitHub Pages (10 minutes)

### Step 1 — Create a GitHub repository

1. Go to **https://github.com/new**
2. Name it `lotto-checker` (exactly this name, lowercase — matters for Step 3)
3. Set it to **Public** (GitHub Pages is free only for public repos on free accounts)
4. Do NOT initialize with a README, `.gitignore`, or license
5. Click **Create repository**

### Step 2 — Upload the project files

Easiest path (no git/terminal needed):

1. On the empty repo page, click **uploading an existing file** (the blue link in "Quick setup")
2. Drag the entire contents of this `lotto-checker` folder into the upload box.
   - Make sure to include the hidden `.github` folder (the workflow lives inside it).
   - If hidden folders are greyed out on your OS: use Ctrl/Cmd+A inside the folder to select everything.
3. Scroll down, click **Commit changes**

You should now see `package.json`, `src/`, `.github/`, etc. in your repo.

### Step 3 — Check the base path matches your repo name

Open `vite.config.js` in your repo. You should see:

```js
base: '/lotto-checker/',
```

If you named your repo something other than `lotto-checker`, click the pencil icon on `vite.config.js` and change this line to match. For example, if your repo is `my-lotto`, use `base: '/my-lotto/'`. The trailing slash matters.

### Step 4 — Enable GitHub Pages

1. In your repo, go to **Settings** (top tabs) → **Pages** (left sidebar)
2. Under **Build and deployment** → **Source**, select **GitHub Actions**
3. That's it — don't pick a branch, the workflow handles everything

### Step 5 — Wait for the first build

1. Click the **Actions** tab at the top of your repo
2. You'll see "Deploy to GitHub Pages" running (yellow dot). Takes about 1–2 minutes.
3. When it turns green, go back to **Settings → Pages**. Your live URL will show at the top:
   ```
   https://YOURUSERNAME.github.io/lotto-checker/
   ```

### Step 6 — Use it

Open the URL on your phone or desktop. Bookmark it. Done.

---

## Updating the app

Any change you make and commit to the `main` branch will auto-deploy in 1–2 minutes. You can edit files directly in GitHub (pencil icon → commit), or clone locally if you prefer.

## Run locally first (optional)

If you have Node.js 18+:

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/lotto-checker/`.

## Troubleshooting

**The Actions build fails with "npm ci" error** — Delete `package-lock.json` from the repo if one got committed accidentally, or just run `npm install` locally and commit the generated `package-lock.json`.

**Live URL shows 404** — Most common cause: `base` in `vite.config.js` doesn't match your repo name. Must be `/repo-name/` with slashes on both sides.

**Blank white page on live URL** — Open browser DevTools console. If you see 404s for JS/CSS files, it's the `base` path again. Fix `vite.config.js` and commit — it'll redeploy.

**Proxy still fails in production** — Your Cloudflare Worker URL is baked into `src/LottoChecker.jsx` as `WORKER_URL`. If you ever redeploy the Worker with a different name, update that line.
