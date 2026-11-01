# 13–0 VCT Draft (Cloudflare)

An unofficial, free fan game. Draft five players from real VCT Masters and Champions rosters (2021–2026) and play solo, against a bot, pass-and-play, or live with a friend.

## What's in here

```
public/index.html          the whole game (data and images are inside this one file)
public/manifest.webmanifest, public/sw.js, public/icons/
                           lets phones install the game like an app and open it offline
src/index.js               the Worker: serves the page, runs live rooms and keeps leaderboards
wrangler.jsonc             Cloudflare settings (Durable Objects: one per live room, one for all leaderboards)
package.json               scripts: npm run dev / npm run deploy
```

Live rooms and leaderboards use Durable Objects with SQLite storage, which are included on the Workers free plan.

Leaderboards need no accounts. Each browser gets a random device id, and players type a name when they post.
Names are screened on the server (length, allowed characters and a blocked-words list). Boards: the daily draft
(first finished run of the day only), Champions gauntlet, All-time category and the three Guess modes (best score kept).

## Deploy from your computer (about 5 minutes)

1. Install Node.js 20 or newer from nodejs.org.
2. Unzip this folder, open a terminal in it, and run:

   ```
   npm install
   npx wrangler login
   npm run deploy
   ```

   `wrangler login` opens your browser to sign in to Cloudflare. Deploy prints your link, something like
   `https://thirteen-0.<your-subdomain>.workers.dev`.

3. To try it on your computer first, run `npm run dev` and open http://localhost:8787.

## Or deploy from GitHub (auto-updates on every push)

1. Put this folder in a new GitHub repository (skip `node_modules`).
2. In the Cloudflare dashboard: Workers & Pages → Create → Import a repository → pick the repo.
3. Leave the build command empty and keep the deploy command as `npx wrangler deploy`.

## Custom domain (optional)

Dashboard → Workers & Pages → thirteen-0 → Settings → Domains & Routes → Add → Custom domain.
The domain needs to be on your Cloudflare account.

## Updating the game

Replace `public/index.html` with a new build and run `npm run deploy` again (or push to GitHub).
Challenge codes made before a data update may stop working afterwards.

## Fan content

Unofficial fan project, not endorsed by or affiliated with Riot Games. VALORANT and all related
assets belong to Riot Games. Keep it free and ad-free to stay within Riot's fan content rules.
Stats from vlr.gg; minimaps via pistachiostudio/valorant_map; ability icons from valorantstats.one. Agents are shown as name badges, not character art.
