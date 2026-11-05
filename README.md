# NEON DEFENDER

A neon-styled, browser-based take on the 1981 arcade classic *Defender*. Pure HTML5 Canvas + vanilla JavaScript, no dependencies, no build step, no assets.

## Play locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Key | Action |
|---|---|
| W / ↑ | Move up |
| S / ↓ | Move down |
| A / ← | Move left (ship faces left) |
| D / → | Move right (ship faces right) |
| Space | Shoot (hold for auto-fire) |
| Shift | Boost |
| P / Esc | Pause |

## How to play

- Enemy ships spawn in waves; each wave adds more, faster, more aggressive enemies.
- Enemies try to abduct the humans standing on the surface. Shoot an abductor to make it drop the human (+250 if they land safely).
- An enemy that carries a human to the top of the screen kills that human.
- You have 3 lives (brief invulnerability after a hit). The game ends when you lose all lives or all humans.
- The radar at the top shows the whole world: you (cyan), enemies (red, white = abducting), humans (yellow).

## Deploy (GitHub Pages)

1. Push to GitHub.
2. Repo **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`.
3. The game is live at `https://<user>.github.io/<repo>/` after a minute.

Netlify/Vercel also work: import the repo with no build command and publish directory `/`.

## Files

- `index.html` – markup for canvas, HUD and menus
- `style.css` – neon UI styling
- `game.js` – game loop, entities, rendering
