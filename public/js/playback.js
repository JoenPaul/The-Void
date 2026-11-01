const playerOrigin = 'https://cinesrc.st';
let playbackVersion = 0, playbackController, playbackTitle, playbackData, playbackProfileId;
let playbackSeason = 1, playbackEpisode = 1, lastProgressWrite = 0, latestPlaybackTime = null;
const playbackProgress = () => {
    const progress = read('void.playback.v1', {});
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
};
function playerProgressKey() { return playbackProfileId + ':' + playbackTitle.id; }
function closePlayer() {
    persistPlaybackProgress();
    playbackVersion++;
    playbackController?.abort();
    $('#player-frame').innerHTML = '';
    $('#player').close();
    playbackData = null;
}
async function openPlayer(id) {
    const movie = titleIndex.get(id);
    if (!movie || !activeProfile || !profilesReady) return;
    persistPlaybackProgress();
    const version = ++playbackVersion;
    playbackController?.abort();
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
            populateEpisodes();
            if (Number.isInteger(savedProgress?.episode) && savedProgress.episode > 0 && savedProgress.episode <= selectedSeason().episodes) {
                $('#player-episode').value = String(savedProgress.episode);
            }
            $('#episode-controls').hidden = false;
        }
        mountPlayer(savedProgress);
    } catch (error) {
        if (version !== playbackVersion || error.name === 'AbortError') return;
        playbackData = null;
        $('#player-status').textContent = 'We couldn’t prepare this title. Please try again later.';
        $('#retry-player').hidden = false;
    }
}
function selectedSeason() { return playbackData.seasons.find(season => season.number === Number($('#player-season').value)); }
function populateEpisodes() {
    const season = selectedSeason();
    $('#player-episode').innerHTML = Array.from({length:season.episodes}, (_, index) => `<option value="${index + 1}">Episode ${index + 1}</option>`).join('');
    $('#player-episode').value = '1';
}
function mountPlayer(progress) {
    if (!playbackData) return;
    if (playbackData.type === 'tv') {
        playbackSeason = Number($('#player-season').value);
        playbackEpisode = Number($('#player-episode').value);
        if (!selectedSeason() || !Number.isInteger(playbackEpisode) || playbackEpisode < 1 || playbackEpisode > selectedSeason().episodes) return;
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
    $('#player-frame').innerHTML = `<iframe id="cinesrc-player" src="${escapeHtml(url.href)}" title="${escapeHtml(playbackTitle.title)} video player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
    $('#player-status').textContent = 'Press play in the player. If a source fails, try another server inside the player.';
}
function handlePlayerMessage(event) {
    const iframe = $('#cinesrc-player');
    if (!playbackData || event.origin !== playerOrigin || !iframe || event.source !== iframe.contentWindow || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (data.type === 'cinesrc:close') { closePlayer(); return; }
    if (data.type === 'cinesrc:error') { $('#player-status').textContent = 'The provider couldn’t play this source. Try another server inside the player.'; return; }
    if (data.type === 'cinesrc:play') $('#player-status').textContent = 'Now playing · CineSrc';
    if (data.type === 'cinesrc:nextepisode' && playbackData.type === 'tv') {
        const season = playbackData.seasons.find(item => item.number === data.season);
        if (!season || !Number.isInteger(data.episode) || data.episode < 1 || data.episode > season.episodes) return;
        playbackSeason = data.season;
        playbackEpisode = data.episode;
        $('#player-season').value = String(playbackSeason);
        populateEpisodes();
        $('#player-episode').value = String(playbackEpisode);
        latestPlaybackTime = null;
        if (!data.internalNavigation) mountPlayer();
    }
    if (Number.isFinite(data.currentTime) && Number.isFinite(data.duration) && data.duration > 0 && data.duration < 604800 && data.currentTime >= 0 && data.currentTime <= data.duration + 1) {
        latestPlaybackTime = {position:data.currentTime, duration:data.duration};
    }
    if (!latestPlaybackTime || !['cinesrc:timeupdate','cinesrc:pause','cinesrc:seeked','cinesrc:ended'].includes(data.type)) return;
    if (data.type === 'cinesrc:timeupdate' && Date.now() - lastProgressWrite < 10000) return;
    persistPlaybackProgress(data.type === 'cinesrc:ended');
}
function persistPlaybackProgress(ended = false) {
    if (!playbackData || !latestPlaybackTime) return;
    const progress = playbackProgress();
    const finished = ended || latestPlaybackTime.position / latestPlaybackTime.duration > .95;
    progress[playerProgressKey()] = {...latestPlaybackTime,position:finished ? 0 : latestPlaybackTime.position,season:playbackSeason,episode:playbackEpisode};
    write('void.playback.v1', progress);
    lastProgressWrite = Date.now();
}
window.addEventListener('message', handlePlayerMessage);
window.addEventListener('pagehide', () => persistPlaybackProgress());
$('#close-player').addEventListener('click', closePlayer);
$('#player').addEventListener('cancel', event => { event.preventDefault(); closePlayer(); });
$('#player-season').addEventListener('change', populateEpisodes);
$('#play-episode').addEventListener('click', () => { persistPlaybackProgress(); mountPlayer(playbackProgress()[playerProgressKey()]); });
$('#retry-player').addEventListener('click', () => openPlayer(playbackTitle.id));
