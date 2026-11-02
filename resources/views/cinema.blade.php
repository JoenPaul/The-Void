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
        <div class="header-actions"><label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" maxlength="100" placeholder="Search titles…" aria-label="Search titles"></label><button id="switch-profile" class="profile-switch" aria-label="Switch profile"><span id="profile-avatar">J</span><span id="profile-name">Profile</span><span>⌄</span></button></div>
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
            <div class="profile-tools"><button id="manage-profiles" class="secondary" disabled>Edit profiles</button><button id="retry-profiles" class="secondary" hidden>Try again</button></div>
            <form id="add-profile">
                <label for="new-name" id="profile-form-label">Make it yours</label>
                <div class="profile-fields">
                    <input id="new-name" placeholder="New profile name" maxlength="24" required autocomplete="off">
                    <label class="avatar-label">Avatar<select id="avatar-choice"><option value="violet">Violet · Initial</option><option value="moon">Moon · ☾</option><option value="star">Starlight · ✦</option><option value="orbit">Orbit · ◈</option></select></label>
                    <button class="secondary" type="submit" id="save-profile" disabled>＋ Add profile</button>
                    <button class="secondary" type="button" id="cancel-edit" hidden>Cancel</button>
                    <button class="archive-button" type="button" id="archive-profile" hidden>Archive profile</button>
                </div>
            </form>
            <p id="profile-error" role="status"></p>
            <small>No passwords. Profiles are shared by everyone using this app.</small>
        </div>
    </dialog>
    <dialog id="profile-confirmation" aria-labelledby="profile-confirm-title" aria-describedby="profile-confirm-description">
        <p class="eyebrow">YOUR WORLD. YOUR STORIES.</p>
        <h2 id="profile-confirm-title"></h2>
        <p id="profile-confirm-description"></p>
        <p id="profile-transition-error" role="alert"></p>
        <div class="archive-actions"><button class="secondary" id="cancel-profile-transition" autofocus>Cancel</button><button class="primary" id="confirm-profile-transition">Continue</button></div>
    </dialog>
    <dialog id="archive-confirmation" aria-labelledby="archive-title" aria-describedby="archive-description">
        <p class="eyebrow">MANAGE PROFILES</p>
        <h2 id="archive-title">Archive profile?</h2>
        <p id="archive-description"></p>
        <p id="archive-error" role="alert"></p>
        <div class="archive-actions"><button class="secondary" id="cancel-archive" autofocus>Keep profile</button><button class="archive-button" id="confirm-archive">Archive profile</button></div>
    </dialog>
    <dialog id="details" aria-labelledby="detail-title"><button class="close" aria-label="Close details">×</button><div id="detail-content"></div></dialog>
    <dialog id="player" aria-labelledby="player-title">
        <div class="player-heading"><div><p class="eyebrow">THE VOID CINEMA</p><h2 id="player-title"></h2></div><button id="close-player" class="secondary" aria-label="Close player">×</button></div>
        <p id="player-status" role="status"></p>
        <div id="episode-controls" hidden><label>Season<select id="player-season"></select></label><label>Episode<select id="player-episode"></select></label><button id="play-episode" class="primary">Play episode</button></div>
        <div id="player-frame"></div>
        <p class="playback-note">Playback provided by CineSrc. Availability and ads are controlled by the provider.</p>
        <button id="retry-player" class="secondary" hidden>Try again</button>
    </dialog>
    <div id="toast" role="status"></div>
    <noscript><div class="noscript">Enable JavaScript to select a profile and browse the collection.</div></noscript>
</body>
</html>

