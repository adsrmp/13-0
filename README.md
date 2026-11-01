# 13–0 VCT Draft (Cloudflare)

An unofficial, free fan game. Draft five players from real VCT Masters and Champions rosters (2021–2026) and play solo, against a bot, pass-and-play, or live with a friend.

## What's in here

```
public/index.html   the whole game (data and images are inside this one file)
src/index.js        the Worker: serves the page and runs live rooms
wrangler.jsonc      Cloudflare settings (one Durable Object per live room)
package.json        scripts: npm run dev / npm run deploy
```

Live rooms use Durable Objects, which are included on the Workers free plan.

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
