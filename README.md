# CakeFactory
Interactive cake-building investment game platform.

## Configuration

### API Base URL

The frontend automatically resolves the backend URL in this priority order:

| Priority | Mechanism | Example |
|----------|-----------|---------|
| 1 | `window.__API_BASE__` global variable | Set in a `<script>` before `js/app.js` |
| 2 | `<meta name="api-base" content="...">` tag | Add to `<head>` of any HTML page |
| 3 | Same-origin (auto) | Used when the page is served from `localhost` / `127.0.0.1` |
| 4 | Default | `https://cakefactory-jn8f.onrender.com` (production Render backend) |

#### Local development

Start the backend locally (defaults to `http://localhost:3000`) and open the HTML files
from the same origin — the same-origin fallback kicks in automatically.

If you serve the frontend from a different port, add this **before** the `js/app.js` script
tag in the relevant HTML file:

```html
<script>window.__API_BASE__ = 'http://localhost:3000';</script>
<script src="js/app.js"></script>
```

#### Static hosting (GitHub Pages, Netlify, etc.)

The default already points at the production Render backend, so no extra configuration is
needed for the standard GitHub Pages deployment.

To point at a different backend without rebuilding, add a `<meta>` tag inside `<head>`:

```html
<meta name="api-base" content="https://your-backend.example.com">
```

