<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#09080d">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>The Void — Find your next obsession</title>
    <link rel="stylesheet" href="{{ asset('css/cinema.css') }}">
    <script src="{{ asset('js/cinema.js') }}" defer></script>
    <script src="{{ asset('js/profile-security.js') }}" defer></script>
    <script src="{{ asset('js/history.js') }}" defer></script>
    <script src="{{ asset('js/releases.js') }}" defer></script>
    <script src="{{ asset('js/playback.js') }}" defer></script>
</head>
<body>
    <header>
        <a class="brand" href="/" aria-label="The Void home"><span class="brand-icon">V</span> THE VOID<span class="brand-dot">.</span></a>
        <nav aria-label="Main navigation">
            <button class="nav-link active" data-page="Discover">Discover</button>
            <button class="nav-link" data-page="Movies">Movies</button>
            <button class="nav-link" data-page="Series">Series</button>
            <button class="nav-link" data-page="My list">My list</button>
        </nav>
        <div class="header-actions"><label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" maxlength="100" placeholder="Search titles…" aria-label="Search titles"></label><div class="profile-menu-wrap"><button id="switch-profile" class="profile-switch" aria-label="Profile menu" aria-expanded="false" aria-controls="profile-menu"><span id="profile-avatar">J</span><span id="profile-name">Profile</span><span>⌄</span></button><div id="profile-menu" hidden><button id="profile-settings">Settings</button><button id="profile-signout">Sign out</button></div></div></div>
    </header>
    <main id="browse">
        <section class="hero release-carousel" aria-label="Newly released movies" aria-roledescription="carousel">
            <div id="release-track" class="release-track"><div class="release-placeholder"><p class="eyebrow">FRESH ON THE BIG SCREEN</p><h1>New stories await.</h1><p id="release-status" role="status">Finding the latest releases…</p><button id="retry-releases" class="secondary" hidden>Try again</button></div></div>
            <div class="hero-bottom release-bottom"><span>NEW RELEASES · THE VOID SELECTS</span><div id="release-dots" class="release-dots" aria-label="Choose a movie"></div><div class="release-controls"><span id="release-count" aria-live="off"></span><button id="release-previous" class="secondary" aria-label="Previous release" disabled>←</button><button id="release-pause" class="secondary" aria-label="Pause carousel" disabled>Pause</button><button id="release-next" class="secondary" aria-label="Next release" disabled>→</button></div></div>
        </section>
        <section id="recently-watched" class="library recent-library" aria-labelledby="recent-title" hidden>
            <div class="row-heading"><h3 id="recent-title"><span>▍</span>Recently watched</h3><small id="recent-profile"></small></div>
            <div class="history-status-line"><p id="recent-status" role="status"></p><button id="retry-history" class="secondary" hidden>Try again</button></div>
            <div id="recent-content"></div>
        </section>
        <section class="library">
            <div class="discovery-heading"><div><p class="eyebrow">A LITTLE ESCAPE. A WHOLE NEW WORLD.</p><h2 id="section-title">Find your kind of story<span>.</span></h2></div><span class="collection-note">Curated for your next movie night</span></div>
            <div class="filters" aria-label="Filter by genre">@foreach ($genres as $genre)<button class="filter {{ $loop->first ? 'active' : '' }}" data-genre="{{ $genre }}" data-types="{{ in_array($genre, $movieGenres, true) ? 'Movies' : '' }} {{ in_array($genre, $seriesGenres, true) ? 'Series' : '' }}" aria-pressed="{{ $loop->first ? 'true' : 'false' }}">{{ $genre }}</button>@endforeach</div>
            <div class="catalog-status"><p id="catalog-status" role="status"></p><button id="catalog-retry" class="secondary" hidden>Try again</button></div>
            <div id="catalog" aria-busy="false"></div>
            <div class="load-more"><button id="load-more" class="secondary" hidden>Explore more titles ↓</button></div>
        </section>
    </main>
    <footer><a class="brand" href="/">THE VOID<span class="brand-dot">.</span></a><span>A place to get lost in a good story.</span><small id="catalog-source">Catalog by TMDB · Player by CineSrc</small><details class="credits"><summary>Credits</summary><a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer"><img src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="The Movie Database (TMDB)" width="90" loading="lazy"></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>Older saved titles retain their original source links. Previously imported Wikipedia descriptions and TVmaze metadata remain attributed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA</a>.</p></details></footer>
    <dialog id="profiles" aria-labelledby="profiles-title">
        <div class="profile-screen">
            <a class="brand" href="/">THE VOID<span class="brand-dot">.</span></a>
            <p class="eyebrow">YOUR WORLD. YOUR STORIES.</p>
            <h2 id="profiles-title">Who’s watching?</h2>
            <p id="profile-subtitle">Pick a profile. Find your escape.</p>
            <div id="profile-cards" aria-busy="true"></div>
            <div class="profile-tools"><button id="retry-profiles" class="secondary" hidden>Try again</button></div>
            <button id="open-add-profile" class="secondary" disabled>＋ Add profile</button>
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
        <label id="entry-pin-label" class="security-field">Profile PIN<input id="entry-pin" type="password" inputmode="numeric" maxlength="12" autocomplete="current-password"></label>
        <p id="profile-transition-error" role="alert"></p>
        <div class="archive-actions"><button class="secondary" id="cancel-profile-transition" autofocus>Cancel</button><button class="primary" id="confirm-profile-transition">Continue</button></div>
    </dialog>
    <dialog id="details" aria-labelledby="detail-title"><button class="close" aria-label="Close details">×</button><div id="detail-content"></div></dialog>
    <dialog id="player" aria-labelledby="player-title">
        <div class="player-heading"><div><p class="eyebrow">THE VOID CINEMA</p><h2 id="player-title"></h2></div><button id="close-player" class="secondary" aria-label="Close player">×</button></div>
        <p id="player-status" role="status"></p>
        <div id="player-frame"></div>
        <section id="episode-controls" aria-label="Series episodes" hidden>
            <div class="episode-heading"><label>Season<select id="player-season"></select></label><p id="episode-count" role="status"></p></div>
            <p class="episode-note">Release dates are scheduled dates. Playback availability depends on the provider.</p>
            <div id="episode-tiles" class="episode-tiles" aria-busy="false"></div>
            <p id="episode-message" role="status"></p><button id="retry-episodes" class="secondary" hidden>Retry episodes</button>
        </section>
        <p class="playback-note">Playback provided by CineSrc. Availability and ads are controlled by the provider.</p>
        <button id="retry-player" class="secondary" hidden>Try again</button>
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
        <div class="admin-heading"><div><p class="eyebrow">THE VOID · SUPERADMIN</p><h2 id="superadmin-title">Superadmin</h2></div></div>
        <form id="superadmin-login"><label class="security-field">Superadmin PIN<input id="admin-pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12" autocomplete="current-password" required></label><div class="admin-keypad"><button type="button" class="secondary" data-admin-digit="1">1</button><button type="button" class="secondary" data-admin-digit="2">2</button><button type="button" class="secondary" data-admin-digit="3">3</button><button type="button" class="secondary" data-admin-digit="4">4</button><button type="button" class="secondary" data-admin-digit="5">5</button><button type="button" class="secondary" data-admin-digit="6">6</button><button type="button" class="secondary" data-admin-digit="7">7</button><button type="button" class="secondary" data-admin-digit="8">8</button><button type="button" class="secondary" data-admin-digit="9">9</button><button type="button" class="secondary" id="admin-pin-clear">Clear</button><button type="button" class="secondary" data-admin-digit="0">0</button><button type="button" class="secondary" id="admin-pin-backspace" aria-label="Delete last digit">⌫</button></div><button class="primary" id="admin-signin">Unlock</button></form>
        <div id="admin-workspace" hidden>
            <aside class="admin-sidebar"><p class="eyebrow">WORKSPACE</p><nav aria-label="Superadmin navigation"><button id="admin-nav-profiles" class="admin-nav-button" aria-current="page"><span aria-hidden="true">♙</span> Profiles</button><button id="admin-nav-settings" class="admin-nav-button"><span aria-hidden="true">⚙</span> Settings</button></nav><button id="admin-logout" class="admin-signout" aria-label="Sign out" title="Sign out"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 4H4v16h5M13 8l4 4-4 4M8 12h12"/></svg></button></aside>
            <div class="admin-main"><section id="admin-accounts"><h3>Profiles</h3><p>User profiles and creation dates</p><div class="admin-table-wrap"><table><thead><tr><th>Profile</th><th>Date created</th><th>Status</th><th>Actions</th></tr></thead><tbody id="admin-profile-rows"></tbody></table></div><p id="admin-empty" hidden>No profiles yet.</p></section>
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

