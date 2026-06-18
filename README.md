# World Cup Sweepstake

A static, pixel-art sweepstake tracker for the 2026 football World Cup.

## Edit the draw

Update `data/players.json`:

```json
{
  "players": [
    {
      "name": "Chris",
      "team": "Brazil"
    }
  ]
}
```

Team names should match the names used in `data/worldcup.json`.

## Result updates

The `Update World Cup Results` GitHub Actions workflow runs hourly and fetches:

```text
https://raw.githubusercontent.com/upbound-web/worldcup-live.json/master/2026/worldcup.json
```

When the fetched data changes, the workflow commits the updated `data/worldcup.json`.

## Local preview

Serve the folder with any static server:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
