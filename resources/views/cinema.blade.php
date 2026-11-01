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
        <section class="hero" aria-labelledby="hero-title">
            <div class="hero-art"></div><div class="hero-shade"></div>
            <div class="hero-content"><div class="eyebrow"><span></span> THE SPOTLIGHT</div><p class="hero-kicker">BEYOND FEAR. BEYOND DESTINY.</p><h1 id="hero-title">DUNE<span>PART TWO</span></h1><div class="metadata"><b>★ 8.5</b><span>2024</span><span>2h 47m</span><span class="badge">PG-13</span><span class="badge">HD</span></div><p class="hero-description">Some destinies are written in sand. Follow Paul Atreides into the desert, where love, loyalty, and the fate of a universe collide.</p><div class="hero-buttons"><button class="primary" id="hero-details">▶ &nbsp; Explore film</button><button class="secondary" id="hero-save">＋ &nbsp; My list</button></div><p class="hero-genres">SCI-FI <span>•</span> ADVENTURE <span>•</span> DRAMA</p></div>
            <div class="hero-bottom"><span>YOUR NEXT OBSESSION STARTS HERE</span><span class="slide-number"><b>01</b> ━━━ <span>THE VOID SELECTS</span></span></div>
        </section>
        <section class="library">
            <div class="discovery-heading"><div><p class="eyebrow">A LITTLE ESCAPE. A WHOLE NEW WORLD.</p><h2 id="section-title">Find your kind of story<span>.</span></h2></div><span class="collection-note">Curated for your next movie night</span></div>
            <div class="filters" aria-label="Filter by genre">@foreach (['All', 'Sci-Fi', 'Adventure', 'Drama', 'Action', 'Animation', 'Thriller'] as $genre)<button class="filter {{ $loop->first ? 'active' : '' }}" data-genre="{{ $genre }}" aria-pressed="{{ $loop->first ? 'true' : 'false' }}">{{ $genre }}</button>@endforeach</div>
            <div class="catalog-status"><p id="catalog-status" role="status"></p><button id="catalog-retry" class="secondary" hidden>Try again</button></div>
            <div id="catalog" aria-busy="false"></div>
            <div class="load-more"><button id="load-more" class="secondary" hidden>Explore more titles ↓</button></div>
        </section>
    </main>
    <footer><a class="brand" href="/">THE VOID<span class="brand-dot">.</span></a><span>A place to get lost in a good story.</span><small id="catalog-source">Preview collection · Playback coming later</small><details class="credits"><summary>Credits</summary><p>Movie data from <a href="https://github.com/servant-42/wikipedia-movie-data" target="_blank" rel="noopener noreferrer">Wikipedia Movie Data</a> (American films, 1900–2023). Descriptions adapted from <a href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a> under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA</a>; individual articles are linked in title details. Poster rights belong to their respective owners.</p><p>Series metadata adapted from <a href="https://www.tvmaze.com" target="_blank" rel="noopener noreferrer">TVmaze</a> under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA</a>. Original show pages are linked in title details.</p><a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer"><img src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="The Movie Database (TMDB)" width="90" loading="lazy"></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></details></footer>
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
                </div>
            </form>
            <p id="profile-error" role="status"></p>
            <small>No passwords. Profiles are shared by everyone using this app.</small>
        </div>
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

