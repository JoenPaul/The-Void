const playerOrigin = 'https://cinesrc.st';
let playbackVersion = 0, playbackController, playbackTitle, playbackData, playbackProfileId;
let playbackSeason = 1, playbackEpisode = 1, lastProgressWrite = 0, latestPlaybackTime = null;
let playbackStarted = false, lastHistoryWrite = 0;
let episodeRequestVersion = 0, episodeController, seasonEpisodes = [];
const playbackProgress = () => {
    const progress = read('void.playback.v1', {});
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
};
function playerProgressKey() { return playbackProfileId + ':' + playbackTitle.id; }
function closePlayer() {
    persistPlaybackProgress(false, true);
    playbackVersion++;
    playbackController?.abort();
    episodeRequestVersion++;
    episodeController?.abort();
    $('#player-frame').innerHTML = '';
    $('#player').close();
    playbackData = null;
    seasonEpisodes = [];
}
async function openPlayer(id) {
    const movie = titleIndex.get(id);
    if (!movie || !activeProfile || !profilesReady) return;
    persistPlaybackProgress(false, true);
    const version = ++playbackVersion;
    playbackController?.abort();
    episodeRequestVersion++;
    episodeController?.abort();
    seasonEpisodes = [];
    playbackController = new AbortController();
    playbackTitle = movie;
    playbackProfileId = activeProfile.id;
    playbackData = null;
    $('#player-title').textContent = movie.title;
    $('#player-status').textContent = 'Preparing your player…';
    $('#player-frame').innerHTML = '';
    $('#episode-controls').hidden = true;
    $('#retry-player').hidden = true;
    if ($('#details').open) $('#details').close();
    if (!$('#player').open) $('#player').showModal();
    try {
        const response = await fetch('/playback/' + encodeURIComponent(id), {headers:{Accept:'application/json'},signal:playbackController.signal});
        if (!response.ok) throw new Error('Playback matching unavailable');
        const data = await response.json();
        if (version !== playbackVersion) return;
        if (!['movie','tv'].includes(data.type) || !/^[1-9][0-9]{0,9}$/.test(String(data.id)) || !Array.isArray(data.seasons)) throw new Error('Invalid playback response');
        playbackData = data;
        const savedProgress = playbackProgress()[playerProgressKey()];
        if (data.type === 'tv') {
            if (!data.seasons.length || data.seasons.some(season => !Number.isInteger(season.number) || season.number < 0 || !Number.isInteger(season.episodes) || season.episodes < 1 || season.episodes > 5000)) throw new Error('Invalid seasons');
            $('#player-season').innerHTML = data.seasons.map(season => `<option value="${season.number}">${escapeHtml(season.name)}</option>`).join('');
            playbackSeason = data.seasons.some(season => season.number === savedProgress?.season) ? savedProgress.season : (data.seasons.find(season => season.number > 0) || data.seasons[0]).number;
            $('#player-season').value = String(playbackSeason);
            $('#episode-controls').hidden = false;
            await loadSeasonEpisodes(savedProgress,true);
        } else {
            mountPlayer(savedProgress);
        }
    } catch (error) {
        if (version !== playbackVersion || error.name === 'AbortError') return;
        playbackData = null;
        $('#player-status').textContent = 'We couldn’t prepare this title. Please try again later.';
        $('#retry-player').hidden = false;
    }
}
function selectedSeason() { return playbackData.seasons.find(season => season.number === Number($('#player-season').value)); }
async function loadSeasonEpisodes(progress = null, autoPlay = false) {
    if (playbackData?.type !== 'tv') return false;
    const season = selectedSeason();
    if (!season) return false;
    const version = ++episodeRequestVersion, playerVersion = playbackVersion;
    episodeController?.abort();
    episodeController = new AbortController();
    seasonEpisodes = [];
    playbackSeason = season.number;
    playbackEpisode = 0;
    latestPlaybackTime = null;
    playbackStarted = false;
    $('#player-frame').innerHTML = '';
    $('#player-status').textContent = 'Choose a released episode below.';
    $('#episode-count').textContent = 'Loading episodes…';
    $('#episode-message').textContent = '';
    $('#episode-tiles').innerHTML = '';
    $('#episode-tiles').setAttribute('aria-busy','true');
    $('#retry-episodes').hidden = true;
    try {
        const response = await fetch('/playback/tv/' + playbackData.id + '/season/' + season.number, {headers:{Accept:'application/json'},signal:episodeController.signal});
        if (!response.ok) throw new Error('Episodes unavailable');
        const data = await response.json();
        if (version !== episodeRequestVersion || playerVersion !== playbackVersion) return false;
        if (data.season !== season.number || !Array.isArray(data.episodes) || data.episodes.length > 5000
            || data.episodes.some(episode => !Number.isInteger(episode.number) || episode.number < 1 || episode.number > 5000 || typeof episode.released !== 'boolean')) throw new Error('Invalid episodes');
        seasonEpisodes = data.episodes;
        const available = seasonEpisodes.filter(episode => episode.released);
        $('#episode-count').textContent = `${available.length} of ${seasonEpisodes.length} episodes released`;
        renderEpisodeTiles();
        if (autoPlay && available.length) {
            const resume = progress?.season === season.number && available.find(episode => episode.number === progress.episode);
            playSelectedEpisode(resume ? resume.number : available[0].number,progress);
        } else if (!available.length) {
            $('#player-status').textContent = 'No episodes are available yet for this season.';
            $('#episode-message').textContent = 'Episode not yet available. Check back after its release date.';
        }
        return true;
    } catch (error) {
        if (version !== episodeRequestVersion || playerVersion !== playbackVersion || error.name === 'AbortError') return false;
        $('#episode-count').textContent = 'Episode information unavailable';
        $('#episode-message').textContent = 'Couldn’t check the episode release dates. Please try again.';
        $('#retry-episodes').hidden = false;
        return false;
    } finally {
        if (version === episodeRequestVersion && playerVersion === playbackVersion) $('#episode-tiles').setAttribute('aria-busy','false');
    }
}
function renderEpisodeTiles() {
    $('#episode-tiles').innerHTML = seasonEpisodes.map(episode => `<button class="episode-tile${episode.released ? '' : ' episode-upcoming'}" data-episode="${episode.number}" aria-pressed="${episode.number === playbackEpisode}"><span class="episode-number">Episode ${episode.number}</span><strong>${escapeHtml(episode.name || 'Episode ' + episode.number)}</strong><span class="episode-release">${episode.released ? 'Released' : 'Not yet available'}${episode.air_date ? ' · ' + escapeHtml(episode.air_date) : ' · Release date not announced'}</span></button>`).join('');
    $('#episode-tiles').querySelectorAll('[data-episode]').forEach(button => button.addEventListener('click', () => playSelectedEpisode(Number(button.dataset.episode),playbackProgress()[playerProgressKey()])));
}
function playSelectedEpisode(number, progress) {
    const episode = seasonEpisodes.find(item => item.number === number);
    if (!episode || playbackData?.type !== 'tv') return;
    if (!episode.released) {
        $('#episode-message').textContent = 'Episode not yet available. ' + (episode.air_date ? 'Scheduled for ' + episode.air_date + '.' : 'A release date has not been announced.');
        return;
    }
    persistPlaybackProgress(false,true);
    playbackEpisode = episode.number;
    $('#episode-message').textContent = '';
    renderEpisodeTiles();
    mountPlayer(progress);
}
async function navigatePlayerEpisode(season, episode) {
    if (!playbackData.seasons.some(item => item.number === season) || !Number.isInteger(episode)) return;
    const version = playbackVersion;
    persistPlaybackProgress(false,true);
    if (season !== playbackSeason) {
        $('#player-season').value = String(season);
        if (!await loadSeasonEpisodes()) return;
    }
    if (version !== playbackVersion || season !== playbackSeason) return;
    if (!seasonEpisodes.some(item => item.number === episode && item.released)) {
        $('#player-frame').innerHTML = '';
        latestPlaybackTime = null;
        playbackStarted = false;
    }
    playSelectedEpisode(episode);
}
function mountPlayer(progress) {
    if (!playbackData) return;
    if (playbackData.type === 'tv') {
        playbackSeason = Number($('#player-season').value);
        if (!selectedSeason() || !seasonEpisodes.some(episode => episode.number === playbackEpisode && episode.released)) return;
    }
    const url = new URL(playerOrigin + '/embed/' + playbackData.type + '/' + playbackData.id);
    url.searchParams.set('color', '#9959ff');
    url.searchParams.set('autoplay', 'false');
    url.searchParams.set('autonext', 'false');
    url.searchParams.set('back', 'close');
    if (playbackData.type === 'tv') {
        url.searchParams.set('s', String(playbackSeason));
        url.searchParams.set('e', String(playbackEpisode));
    }
    const sameEpisode = playbackData.type === 'movie' || (progress?.season === playbackSeason && progress?.episode === playbackEpisode);
    if (sameEpisode && Number.isFinite(progress?.position) && progress.position > 10 && progress.position < 604800) url.searchParams.set('t', String(Math.floor(progress.position)));
    latestPlaybackTime = null;
    lastProgressWrite = 0;
    playbackStarted = false;
    lastHistoryWrite = 0;
    $('#player-frame').innerHTML = `<iframe id="cinesrc-player" src="${escapeHtml(url.href)}" title="${escapeHtml(playbackTitle.title)} video player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
    $('#player-status').textContent = 'Press play in the player. If a source fails, try another server inside the player.';
}
function handlePlayerMessage(event) {
    const iframe = $('#cinesrc-player');
    if (!playbackData || event.origin !== playerOrigin || !iframe || event.source !== iframe.contentWindow || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (data.type === 'cinesrc:close') { closePlayer(); return; }
    if (data.type === 'cinesrc:error') { $('#player-status').textContent = 'The provider couldn’t play this source. Try another server inside the player.'; return; }
    if (data.type === 'cinesrc:play') { playbackStarted = true; $('#player-status').textContent = 'Now playing · CineSrc'; }
    if (data.type === 'cinesrc:nextepisode' && playbackData.type === 'tv') {
        navigatePlayerEpisode(data.season,data.episode);
        return;
    }
    if (Number.isFinite(data.currentTime) && Number.isFinite(data.duration) && data.duration > 0 && data.duration < 604800 && data.currentTime >= 0 && data.currentTime <= data.duration + 1) {
        latestPlaybackTime = {position:data.currentTime, duration:data.duration};
    }
    if (!latestPlaybackTime || !['cinesrc:timeupdate','cinesrc:pause','cinesrc:seeked','cinesrc:ended'].includes(data.type)) return;
    if (data.type === 'cinesrc:timeupdate' && Date.now() - lastProgressWrite < 10000) return;
    persistPlaybackProgress(data.type === 'cinesrc:ended', data.type !== 'cinesrc:timeupdate');
}
function persistPlaybackProgress(ended = false, syncHistory = false) {
    if (!playbackData || !latestPlaybackTime) return;
    const progress = playbackProgress();
    const finished = ended || latestPlaybackTime.position / latestPlaybackTime.duration > .95;
    progress[playerProgressKey()] = {...latestPlaybackTime,position:finished ? 0 : latestPlaybackTime.position,season:playbackSeason,episode:playbackEpisode,updatedAt:Date.now()};
    write('void.playback.v1', progress);
    lastProgressWrite = Date.now();
    if (playbackStarted && latestPlaybackTime.position >= 5 && typeof queueWatchHistory === 'function' && (syncHistory || Date.now() - lastHistoryWrite >= 30000)) {
        lastHistoryWrite = Date.now();
        queueWatchHistory(playbackProfileId, playbackTitle, {
            position:Math.min(Math.floor(latestPlaybackTime.position),Math.floor(latestPlaybackTime.duration)), duration:Math.floor(latestPlaybackTime.duration),
            season:playbackData.type === 'tv' ? playbackSeason : null, episode:playbackData.type === 'tv' ? playbackEpisode : null, finished,
        });
    }
}
window.addEventListener('message', handlePlayerMessage);
window.addEventListener('pagehide', () => persistPlaybackProgress(false, true));
$('#close-player').addEventListener('click', closePlayer);
$('#player').addEventListener('cancel', event => { event.preventDefault(); closePlayer(); });
$('#player-season').addEventListener('change', () => { persistPlaybackProgress(false,true); loadSeasonEpisodes(); });
$('#retry-episodes').addEventListener('click', () => loadSeasonEpisodes());
$('#retry-player').addEventListener('click', () => openPlayer(playbackTitle.id));
