# The Void — Cinema & Watch Party Platform

**The Void** is a dark-themed streaming discovery and synchronized Watch Party web application built with **Laravel 13 (PHP 8.5)**, **FrankenPHP / Caddy**, **TMDB API**, and **CineSrc**.

**Figma Design System & UI Redesign:** [The Void — Watch Party & Cinema UI Redesign](https://www.figma.com/design/Rl20vp3jH2mmIqZvIhv5F3)

---

## Major Changes & Features

### 1. Watch Party Theater & Social Discovery
- **Split Watch Party Theater (`#player`):** Expands into a split workspace featuring the 16:9 player on the left and a dedicated **Participants Drawer** (`#party-drawer`) on the right showing live viewer avatars, display names, host badges, and real-time sync indicators.
- **1-Click Quick Invite Profile Chips:** Hosts can invite other profiles in a single click directly from the Watch Party drawer (`#party-quick-chips`) or via the accessible profile selector (`#party-invite-form`).
- **Direct Watch Party Entry Points:** Added **`＋ Watch party`** CTAs directly on the **Hero Release Carousel** and **Title Details Modal** (`openAndStartWatchParty`) so hosts can launch a room in one click.
- **Live Watch Parties Home Strip (`#live-parties-strip`):** Surfaces active watch party invitations and a **Have a Room Code?** quick-entry form right on the Discover home screen.
- **Join via Room Code or Invite URL:** Both the header invitations popover (`#party-invitations`) and the home strip accept either a 6–24 character room code (`#ROOM123456`) or a full invite link (`https://.../?party=ROOM123456`).
- **Host-Locked Guest Sync & Visibility-Aware Polling:** Guests automatically follow host play, pause, seek, and episode changes without affecting their solo watch progress. Polling adapts from `4s` (active tab) to `12s` (background tab) and immediately resyncs on tab focus.

### 2. Overall Cinema UI Redesign (Desktop, Mobile & Smart TV)
- **Flat Dark-Violet Surface System:** Uses high-contrast solid surfaces (`#09080D`, `#141219`, `#1B1626`, `#231D30`, `#2A1B4A`, `#9959FF`) with zero decorative gradients.
- **Hero Carousel & "Up Next" Spotlight:** Displays `4K HDR` and `★ TMDB` metadata chips alongside an **Up Next in Carousel** spotlight panel (`.hero-spotlight`) allowing viewers to jump directly to upcoming releases.
- **Widescreen 16:9 "Continue Watching" Rail:** Displays episode badges (`S02 · E04` or `MOVIE`), watched/remaining time pills, and full-width progress bars.
- **Full Genre Filtering & Series Season Pill Tabs:** All movie and series genre filters are available directly on **Discover**, and the Series player provides interactive **Season Pill Tabs** (`#season-pills`) above 3-column episode cards.
- **Mobile-Responsive Navigation:** Pins the 4-tab navigation bar (`.browse-nav`) to the bottom of mobile viewports while keeping the top header (brand, expandable search, notifications bell, and profile menu) sticky and accessible.
- **Smart TV / 10-Foot Living-Room Optimizations:**
  - **D-Pad Spatial Arrow-Key Navigation:** `ArrowLeft`, `ArrowRight`, `ArrowUp`, and `ArrowDown` navigate across profile cards, rails, filter pills, keypad buttons, and modals while centering focused items in view.
  - **On-Screen PIN Keypads:** Both Profile Login (`#entry-pin-keypad`) and Superadmin Login (`#superadmin-login`) provide on-screen `0–9` keypads for TV remotes.
  - **10-Foot Scaling & Low-Power GPU Mode:** Scales `#player`, typography, and 4-column episode grids on `1600px+` / 4K screens and replaces heavy CSS backdrop blurs with high-opacity flat backdrops for smooth performance on Smart TV browsers.

### 3. Four-Layer Caching & Performance Architecture
1. **CDN / Edge HTTP Caching (`App\Http\Middleware\CachePublicResponse`):** Public, non-personalized routes (`/catalog`, `/releases`, `/playback/{title}`, `/playback/tv/{series}/season/{season}`) strip session/cookie middleware and emit `Cache-Control` and `CDN-Cache-Control` headers with `s-maxage` and `stale-while-revalidate`.
2. **Server-Side TMDB Cache (`CatalogController` & `PlaybackController`):** Caches popular genre feeds for 30 minutes (`1800s`), series metadata for 1 hour (`3600s`), and search/releases/episodes for 5 minutes (`300s`).
3. **Immutable Static Assets (`Caddyfile`):** Serves versioned `/css/*` and `/js/*` assets with `Cache-Control: public, max-age=31536000, immutable` and `zstd` / `gzip` compression.
4. **Client-Side Memory & `sessionStorage` Cache:** Caches genre discovery rows (`void.genre.*`) and search results in the browser for instant tab switching.

---

## Testing

Run the frontend Node UI test suite (55 tests) and backend PHPUnit feature/unit test suite (51 tests):

```bash
node --test tests/catalog-ui.test.cjs
php artisan test
```

---

## Deployment (Render)

The application deploys automatically on **Render** from the `main` branch using `Dockerfile.vercel` (FrankenPHP + PHP 8.5 Alpine + `Caddyfile`). On container startup, database migrations and `SuperadminSeeder` run automatically before FrankenPHP starts serving traffic.
