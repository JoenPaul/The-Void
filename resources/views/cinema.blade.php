<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#09080d">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>The Void — Find your next obsession</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap">
    <link rel="preconnect" href="https://image.tmdb.org" crossorigin>
    <link rel="dns-prefetch" href="https://cinesrc.st">
    <link rel="stylesheet" href="{{ asset('css/cinema.css') }}?v={{ @filemtime(public_path('css/cinema.css')) }}">
    <script src="{{ asset('js/cinema.js') }}?v={{ @filemtime(public_path('js/cinema.js')) }}" defer></script>
    <script src="{{ asset('js/profile-security.js') }}?v={{ @filemtime(public_path('js/profile-security.js')) }}" defer></script>
    <script src="{{ asset('js/history.js') }}?v={{ @filemtime(public_path('js/history.js')) }}" defer></script>
    <script src="{{ asset('js/releases.js') }}?v={{ @filemtime(public_path('js/releases.js')) }}" defer></script>
    <script src="{{ asset('js/playback.js') }}?v={{ @filemtime(public_path('js/playback.js')) }}" defer></script>
</head>
<body>
    <header>
        <a class="brand" href="/" aria-label="The Void home"><span class="brand-icon">V</span> THE VOID<span class="brand-dot">.</span></a>
        <nav class="browse-nav" aria-label="Main navigation">
            <button class="nav-link active" data-page="Discover"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/></svg>Discover</button>
            <button class="nav-link" data-page="Movies"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M16 5v14"/></svg>Movies</button>
            <button class="nav-link" data-page="Series"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 3v4M16 3v4"/></svg>Series</button>
            <button class="nav-link" data-page="My list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>My list</button>
        </nav>
        <div class="header-actions">
            <label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" maxlength="100" placeholder="Search titles…" aria-label="Search titles"><kbd class="search-kbd" aria-hidden="true">/</kbd></label>
            <div id="party-notifications" hidden>
                <button id="party-notification-toggle" type="button" aria-label="Watch party invitations" aria-expanded="false" aria-controls="party-invitations">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/></svg>
                    <span id="party-invitation-count" aria-hidden="true" hidden></span>
                </button>
                <section id="party-invitations" aria-labelledby="party-invitations-title" hidden>
                    <div class="invitations-header">
                        <h2 id="party-invitations-title">Watch party invitations</h2>
                        <span id="party-invitations-badge" class="invitations-badge" hidden></span>
                    </div>
                    <p id="party-invitations-empty">No active invitations.</p>
                    <ul id="party-invitations-list"></ul>
                    <form id="party-code-form" class="party-code-form" autocomplete="off">
                        <label for="party-code-input">Or join with room code</label>
                        <div class="party-code-row">
                            <input id="party-code-input" type="text" maxlength="120" placeholder="Paste code or link…" aria-label="Watch party room code">
                            <button id="party-code-submit" class="secondary" type="submit">Join</button>
                        </div>
                    </form>
                </section>
            </div>
            <div class="profile-menu-wrap"><button id="switch-profile" class="profile-switch" aria-label="Profile menu" aria-expanded="false" aria-controls="profile-menu"><span id="profile-avatar">J</span><span id="profile-name">Profile</span><span>⌄</span></button><div id="profile-menu" hidden><button id="profile-settings">Settings</button><button id="profile-signout">Sign out</button></div></div>
        </div>
    </header>
    <main id="browse">
        <section class="hero release-carousel" aria-label="Newly released movies" aria-roledescription="carousel">
            <div id="release-track" class="release-track"><div class="release-placeholder"><p class="eyebrow">FRESH ON THE BIG SCREEN</p><h1>New stories await.</h1><p id="release-status" role="status">Finding the latest releases…</p><button id="retry-releases" class="secondary" hidden>Try again</button></div></div>
            <div class="hero-bottom release-bottom"><span id="release-count" aria-live="off"></span><div id="release-dots" class="release-dots" aria-label="Choose a movie"></div><div class="release-controls"><button id="release-previous" class="secondary" aria-label="Previous release" disabled>←</button><button id="release-pause" class="secondary" aria-label="Pause carousel" disabled>Pause</button><button id="release-next" class="secondary" aria-label="Next release" disabled>→</button></div></div>
        </section>
        <section id="live-parties-strip" class="library live-parties-strip" aria-labelledby="live-parties-title" hidden>
            <div class="row-heading">
                <h3 id="live-parties-title"><span class="live-dot" aria-hidden="true"></span>Live Watch Parties · Join Friends Instantly</h3>
                <small>Enter a room code or click to join synchronized playback</small>
            </div>
            <div class="live-parties-layout">
                <div id="live-parties-cards" class="live-parties-grid"></div>
                <form id="strip-party-code-form" class="live-party-card live-party-code-card" autocomplete="off">
                    <div class="live-party-info">
                        <strong>Have a Room Code?</strong>
                        <span>Enter 6–24 char party code or invite link</span>
                    </div>
                    <div class="strip-code-controls">
                        <input id="strip-party-code-input" type="text" maxlength="120" placeholder="Code e.g. V9K2…" aria-label="Enter watch party room code">
                        <button class="secondary" type="submit">Enter Code</button>
                    </div>
                </form>
            </div>
        </section>
        <section id="recently-watched" class="library recent-library" aria-labelledby="recent-title" hidden>
            <div class="row-heading"><h3 id="recent-title"><span>▍</span>Recently watched</h3><small id="recent-profile"></small></div>
            <div class="history-status-line"><p id="recent-status" role="status"></p><button id="retry-history" class="secondary" hidden>Try again</button></div>
            <div id="recent-content"></div>
        </section>
        <section class="library">
            <div class="discovery-heading"><div><p class="eyebrow">A LITTLE ESCAPE. A WHOLE NEW WORLD.</p><h2 id="section-title">Find your kind of story<span>.</span></h2></div><span class="collection-note">Curated for your next movie night</span></div>
            <div class="filters" role="group" aria-label="Filter by genre" tabindex="0">@foreach ($genres as $genre)<button class="filter {{ $loop->first ? 'active' : '' }}" data-genre="{{ $genre }}" data-types="{{ in_array($genre, $movieGenres, true) ? 'Movies' : '' }} {{ in_array($genre, $seriesGenres, true) ? 'Series' : '' }}" aria-pressed="{{ $loop->first ? 'true' : 'false' }}">{{ $genre }}</button>@endforeach</div>
            <div class="catalog-status"><p id="catalog-status" role="status"></p><button id="catalog-retry" class="secondary" hidden>Try again</button></div>
            <div id="catalog" aria-busy="false"></div>
            <div class="load-more"><button id="load-more" class="secondary" hidden>Explore more titles ↓</button></div>
        </section>
    </main>
    <footer><a class="brand" href="/">THE VOID<span class="brand-dot">.</span></a><span>A place to get lost in a good story.</span><small id="catalog-source">Catalog by TMDB · Player by CineSrc</small><details class="credits"><summary>Credits</summary><a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer"><img src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="The Movie Database (TMDB)" width="90" loading="lazy"></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>Older saved titles retain their original source links. Previously imported Wikipedia descriptions and TVmaze metadata remain attributed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA</a>.</p></details></footer>
    <dialog id="profiles" aria-labelledby="profiles-title">
        <div class="profile-screen">
            <a class="brand" href="/"><span class="brand-icon">V</span> THE VOID<span class="brand-dot">.</span></a>
            <div class="profile-hero-head">
                <p class="eyebrow">YOUR WORLD. YOUR STORIES.</p>
                <h2 id="profiles-title">Who’s watching?</h2>
                <p id="profile-subtitle">Select your profile to resume watching or join an active Watch Party.</p>
            </div>
            <div class="profile-cards-stage">
                <div id="profile-cards" aria-busy="true"></div>
                <button id="open-add-profile" class="profile-card profile-card-add" type="button" disabled>
                    <span class="avatar avatar-add">＋</span>
                    <strong class="profile-card-name">Add Profile</strong>
                    <span class="profile-card-status">Create new space</span>
                </button>
            </div>
            <div class="profile-tools"><button id="retry-profiles" class="secondary" hidden>Try again</button></div>
            <p id="profile-error" role="status"></p>
            <small>Your profile, protected by your PIN.</small>
            <button id="superadmin-open" class="admin-launch" aria-label="Superadmin login" title="Superadmin login"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg></button>
        </div>
    </dialog>
    <dialog id="profile-editor" class="security-dialog" aria-labelledby="profile-form-label">
        <p class="eyebrow">MAKE IT YOURS</p>
            <form id="add-profile">
                <h2 id="profile-form-label">Create your profile</h2>
                <label for="new-name">Profile name</label>
                <div class="profile-fields">
                    <input id="new-name" placeholder="New profile name" maxlength="24" required autocomplete="off">
                    <span id="new-pin-fields" class="pin-fields"><label>PIN<input id="new-pin" type="password" inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" autocomplete="new-password" placeholder="4–12 digits" required></label><label>Confirm PIN<input id="confirm-new-pin" type="password" inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" autocomplete="new-password" required></label></span>
                    <label class="avatar-label">Avatar<select id="avatar-choice"><option value="violet">Violet · Initial</option><option value="moon">Moon · ☾</option><option value="star">Starlight · ✦</option><option value="orbit">Orbit · ◈</option></select></label>
                    <button class="primary" type="submit" id="save-profile" disabled>＋ Add profile</button>
                    <button class="secondary" type="button" id="cancel-edit">Cancel</button>
                </div>
            </form>
        <p id="profile-form-error" role="alert"></p>
    </dialog>
    <dialog id="profile-confirmation" aria-labelledby="profile-confirm-title" aria-describedby="profile-confirm-description">
        <p class="eyebrow">YOUR WORLD. YOUR STORIES.</p>
        <h2 id="profile-confirm-title"></h2>
        <p id="profile-confirm-description"></p>
        <label id="entry-pin-label" class="security-field">Profile PIN<input id="entry-pin" type="password" inputmode="numeric" maxlength="12" autocomplete="current-password" placeholder="4–12 digits"></label>
        <div id="entry-pin-keypad" class="admin-keypad profile-keypad" aria-label="Profile PIN keypad">
            <button type="button" class="secondary" data-entry-digit="1">1</button>
            <button type="button" class="secondary" data-entry-digit="2">2</button>
            <button type="button" class="secondary" data-entry-digit="3">3</button>
            <button type="button" class="secondary" data-entry-digit="4">4</button>
            <button type="button" class="secondary" data-entry-digit="5">5</button>
            <button type="button" class="secondary" data-entry-digit="6">6</button>
            <button type="button" class="secondary" data-entry-digit="7">7</button>
            <button type="button" class="secondary" data-entry-digit="8">8</button>
            <button type="button" class="secondary" data-entry-digit="9">9</button>
            <button type="button" class="secondary" id="entry-pin-clear">Clear</button>
            <button type="button" class="secondary" data-entry-digit="0">0</button>
            <button type="button" class="secondary" id="entry-pin-backspace" aria-label="Delete last digit">⌫</button>
        </div>
        <p id="profile-transition-error" role="alert"></p>
        <div class="archive-actions"><button class="secondary" id="cancel-profile-transition" autofocus>Cancel</button><button class="primary" id="confirm-profile-transition">Continue</button></div>
    </dialog>
    <dialog id="details" aria-labelledby="detail-title"><button class="close" aria-label="Close details">×</button><div id="detail-content"></div></dialog>
    <dialog id="player" aria-labelledby="player-title">
        <div class="player-heading">
            <div class="player-title-wrap">
                <p class="eyebrow">THE VOID CINEMA</p>
                <h2 id="player-title"></h2>
            </div>
            <div class="player-header-actions">
                <button id="party-start" class="secondary" type="button">＋ Watch party</button>
                <button id="close-player" class="secondary" aria-label="Close player">×</button>
            </div>
        </div>
        <section id="party-bar" class="party-bar" aria-label="Watch party controls" hidden>
            <div class="party-meta">
                <span id="party-role-badge" class="party-badge">HOST</span>
                <span id="party-room-code" class="party-room-pill" hidden></span>
                <p id="party-summary" role="status"></p>
                <span id="party-members" class="party-members"></span>
            </div>
            <div class="party-actions">
                <button id="party-invite" class="secondary" type="button" aria-label="Invite profile" aria-expanded="false" aria-controls="party-invite-form" title="Invite profile" hidden>
                    <svg class="party-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m4-12v6m-3-3h6"/></svg><span class="party-action-label">Invite profile</span>
                </button>
                <button id="party-copy" class="secondary" type="button" aria-label="Copy invite link" title="Copy invite link">
                    <svg class="party-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .5l4-4a5 5 0 0 0-7-7l-2.3 2.3m2.3 6.2a5 5 0 0 0-7-.5l-4 4a5 5 0 0 0 7 7l2.3-2.3"/></svg><span class="party-action-label">Copy invite link</span>
                </button>
                <button id="party-sync" class="secondary" type="button" aria-label="Sync to host" title="Sync to host" hidden>
                    <svg class="party-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4v5h-5M4 20v-5h5m-4.3-5a8 8 0 0 1 13.4-4L20 9m-16 6 1.9 3a8 8 0 0 0 13.4-4"/></svg><span class="party-action-label">Sync to host</span>
                </button>
                <button id="party-end" class="secondary party-danger" type="button" aria-label="End party" title="End party">
                    <svg class="party-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17H5V7h5m6 1 4 4-4 4m-7-4h11"/></svg><span id="party-end-label" class="party-action-label">End party</span>
                </button>
            </div>
            <form id="party-invite-form" class="party-actions party-invite-form" hidden>
                <label for="party-invite-profile">Profile</label>
                <select id="party-invite-profile" required></select>
                <button id="party-invite-send" class="secondary" type="submit">Send invite</button>
                <span id="party-invite-status" role="status"></span>
            </form>
        </section>
        <div class="player-workspace">
            <div class="player-stage">
                <p id="player-status" role="status"></p>
                <div id="player-frame"></div>
                <section id="episode-controls" aria-label="Series episodes" hidden>
                    <div class="episode-heading">
                        <div id="season-pills" class="season-pills" role="tablist" aria-label="Seasons"></div>
                        <label class="season-select-label">Season<select id="player-season"></select></label>
                        <p id="episode-count" role="status"></p>
                    </div>
                    <p class="episode-note">Release dates are scheduled dates. Playback availability depends on the provider.</p>
                    <div id="episode-tiles" class="episode-tiles" aria-busy="false"></div>
                    <p id="episode-message" role="status"></p><button id="retry-episodes" class="secondary" hidden>Retry episodes</button>
                </section>
                <p class="playback-note">Playback provided by CineSrc. Availability and ads are controlled by the provider.</p>
                <button id="retry-player" class="secondary" hidden>Try again</button>
            </div>
            <aside id="party-drawer" class="party-drawer" aria-label="Watch party participants" hidden>
                <div class="party-drawer-head">
                    <h3>Participants</h3>
                    <span id="party-drawer-count" class="party-drawer-count">1</span>
                </div>
                <ul id="party-roster" class="party-roster"></ul>
                <div id="party-quick-invite" class="party-quick-invite" hidden>
                    <p class="eyebrow">QUICK INVITE PROFILES</p>
                    <div id="party-quick-chips" class="party-quick-chips"></div>
                </div>
            </aside>
        </div>
    </dialog>
    <dialog id="user-settings" class="security-dialog" aria-labelledby="user-settings-title"><h2 id="user-settings-title">Profile settings</h2><div class="user-settings-actions"><button id="user-edit-profile" class="secondary">Edit profile</button><button id="user-change-pin" class="secondary">Change PIN</button><button id="user-settings-close" class="secondary">Done</button></div></dialog>
    <dialog id="pin-settings" class="security-dialog" aria-labelledby="pin-settings-title">
        <p class="eyebrow">PROFILE SECURITY</p><h2 id="pin-settings-title">Change your PIN</h2>
        <p id="pin-settings-description">Choose a PIN with 4–12 digits.</p>
        <form id="change-pin-form">
            <label class="security-field">Current PIN<input id="current-pin" type="password" inputmode="numeric" maxlength="12" autocomplete="current-password" required></label>
            <label class="security-field">New PIN<input id="changed-pin" type="password" inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" autocomplete="new-password" required></label>
            <label class="security-field">Confirm new PIN<input id="changed-pin-confirm" type="password" inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" autocomplete="new-password" required></label>
            <p id="pin-settings-error" role="alert"></p><div class="archive-actions"><button type="button" id="cancel-pin-settings" class="secondary">Cancel</button><button id="save-pin" class="primary">Save PIN</button></div>
        </form>
    </dialog>
    <dialog id="superadmin" class="security-dialog" aria-labelledby="superadmin-title">
        <div class="admin-heading"><button id="admin-menu-toggle" class="secondary" aria-label="Toggle workspace menu" aria-expanded="false" aria-controls="admin-sidebar" hidden><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><div><p class="eyebrow">THE VOID · SUPERADMIN</p><h2 id="superadmin-title">Superadmin</h2></div><button id="superadmin-close" class="close" aria-label="Close superadmin">×</button></div>
        <form id="superadmin-login"><label class="security-field">Superadmin PIN<input id="admin-pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12" autocomplete="current-password" required></label><div class="admin-keypad"><button type="button" class="secondary" data-admin-digit="1">1</button><button type="button" class="secondary" data-admin-digit="2">2</button><button type="button" class="secondary" data-admin-digit="3">3</button><button type="button" class="secondary" data-admin-digit="4">4</button><button type="button" class="secondary" data-admin-digit="5">5</button><button type="button" class="secondary" data-admin-digit="6">6</button><button type="button" class="secondary" data-admin-digit="7">7</button><button type="button" class="secondary" data-admin-digit="8">8</button><button type="button" class="secondary" data-admin-digit="9">9</button><button type="button" class="secondary" id="admin-pin-clear">Clear</button><button type="button" class="secondary" data-admin-digit="0">0</button><button type="button" class="secondary" id="admin-pin-backspace" aria-label="Delete last digit">⌫</button></div><button class="primary" id="admin-signin">Unlock</button></form>
        <div id="admin-workspace" hidden>
            <aside id="admin-sidebar" class="admin-sidebar"><p class="eyebrow">WORKSPACE</p><nav aria-label="Superadmin navigation"><button id="admin-nav-profiles" class="admin-nav-button" aria-current="page"><span aria-hidden="true">♙</span> Profiles</button><button id="admin-nav-settings" class="admin-nav-button"><span aria-hidden="true">⚙</span> Settings</button></nav><button id="admin-logout" class="admin-signout" aria-label="Sign out" title="Sign out"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 4H4v16h5M13 8l4 4-4 4M8 12h12"/></svg></button></aside>
            <div class="admin-main"><section id="admin-accounts"><h3>Profiles</h3><p>User profiles and creation dates</p><div id="admin-kpis" class="admin-kpi-row"></div><div class="admin-table-wrap"><table><thead><tr><th>Profile</th><th>Date created</th><th>Status</th><th>Actions</th></tr></thead><tbody id="admin-profile-rows"></tbody></table></div><p id="admin-empty" hidden>No profiles yet.</p></section>
            <section id="admin-settings-panel" hidden><h3>Settings</h3><p>Manage your superadmin access.</p><div class="admin-setting-card"><h4>Superadmin PIN</h4><p>Update the PIN you use to unlock this workspace.</p><button id="admin-change-pin" class="secondary">Change PIN</button></div></section>
            </div></div>
        <p id="admin-message" role="status"></p>
    </dialog>
    <dialog id="admin-pin-settings" class="security-dialog" aria-labelledby="admin-pin-title"><h2 id="admin-pin-title">Change superadmin PIN</h2><p>Choose 6–12 digits.</p><form id="admin-pin-form"><label class="security-field">Current PIN<input id="admin-current-pin" type="password" inputmode="numeric" maxlength="12" required autocomplete="current-password"></label><label class="security-field">New PIN<input id="admin-new-pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12" required autocomplete="new-password"></label><label class="security-field">Confirm new PIN<input id="admin-confirm-pin" type="password" inputmode="numeric" maxlength="12" required autocomplete="new-password"></label><p id="admin-pin-error" role="alert"></p><button id="admin-pin-cancel" type="button" class="secondary">Cancel</button><button id="admin-pin-save" class="primary">Save PIN</button></form></dialog>
    <dialog id="admin-reset" class="security-dialog" aria-labelledby="admin-reset-title"><h2 id="admin-reset-title">Reset PIN?</h2><p id="admin-reset-description"></p><p id="admin-reset-error" role="alert"></p><div class="archive-actions"><button id="admin-reset-cancel" class="secondary">Cancel</button><button id="admin-reset-confirm" class="primary">Reset to 123</button></div></dialog>
    <div id="toast" role="status"></div>
    <noscript><div class="noscript">Enable JavaScript to select a profile and browse the collection.</div></noscript>
</body>
</html>

