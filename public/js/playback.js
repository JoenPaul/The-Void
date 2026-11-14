const playerOrigin = 'https://cinesrc.st';
let playbackVersion = 0, playbackController, playbackTitle, playbackData, playbackProfileId;
let playbackSeason = 1, playbackEpisode = 1, lastProgressWrite = 0, latestPlaybackTime = null;
let playbackStarted = false, lastHistoryWrite = 0;
let episodeRequestVersion = 0, episodeController, seasonEpisodes = [];
let activeParty = null, partyPollTimer = null, pendingPartyCode = null, applyingPartyState = false, partyBusy = false;

try {
    const partyParam = new URLSearchParams(window.location?.search || '').get('party');
    if (partyParam && /^[A-Za-z0-9]{6,24}$/.test(partyParam)) pendingPartyCode = partyParam;
} catch {}

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
async function openPlayer(id, partyProgress = null) {
    if (activeParty && !activeParty.is_host && !applyingPartyState && id !== activeParty.title_key) {
        notify('Only the watch party admin can change the movie. Leave the party first to watch on your own.');
        if (!$('#player').open) $('#player').showModal();
        return;
    }
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
    renderPartyBar();
    if ($('#details').open) $('#details').close();
    if (!$('#player').open) $('#player').showModal();
    try {
        const resumeProgress = partyProgress || playbackProgress()[playerProgressKey()];
        if (/^movie:[1-9][0-9]{0,9}$/.test(id)) {
            playbackData = {type:'movie',id:id.slice(6),seasons:[]};
            mountPlayer(resumeProgress);
            if (activeParty?.is_host && !applyingPartyState) await pushPartyState(0, false);
            return;
        }
        const response = await fetch('/playback/' + encodeURIComponent(id), {headers:{Accept:'application/json'},signal:playbackController.signal});
        if (!response.ok) throw new Error('Playback matching unavailable');
        const data = await response.json();
        if (version !== playbackVersion) return;
        if (!['movie','tv'].includes(data.type) || !/^[1-9][0-9]{0,9}$/.test(String(data.id)) || !Array.isArray(data.seasons)) throw new Error('Invalid playback response');
        playbackData = data;
        if (data.type === 'tv') {
            if (!data.seasons.length || data.seasons.some(season => !Number.isInteger(season.number) || season.number < 0 || !Number.isInteger(season.episodes) || season.episodes < 1 || season.episodes > 5000)) throw new Error('Invalid seasons');
            $('#player-season').innerHTML = data.seasons.map(season => `<option value="${season.number}">${escapeHtml(season.name)}</option>`).join('');
            playbackSeason = data.seasons.some(season => season.number === resumeProgress?.season) ? resumeProgress.season : (data.seasons.find(season => season.number > 0) || data.seasons[0]).number;
            $('#player-season').value = String(playbackSeason);
            $('#episode-controls').hidden = false;
            renderPartyBar();
            await loadSeasonEpisodes(resumeProgress,true);
        } else {
            mountPlayer(resumeProgress);
            if (activeParty?.is_host && !applyingPartyState) await pushPartyState(0, false);
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
    $('#player-status').textContent = 'Choose an episode below.';
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
            || data.episodes.some(episode => !Number.isInteger(episode.number) || episode.number < 1 || episode.number > 5000)) throw new Error('Invalid episodes');
        seasonEpisodes = data.episodes;
        $('#episode-count').textContent = `${seasonEpisodes.length} listed`;
        renderEpisodeTiles();
        if (autoPlay && seasonEpisodes.length) {
            const resume = progress?.season === season.number && seasonEpisodes.find(episode => episode.number === progress.episode);
            playSelectedEpisode(resume ? resume.number : seasonEpisodes[0].number,progress, true);
        } else if (!seasonEpisodes.length) {
            $('#player-status').textContent = 'No episodes are listed for this season.';
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
    const locked = Boolean(activeParty && !activeParty.is_host);
    $('#episode-tiles').innerHTML = seasonEpisodes.map(episode => `<button class="episode-tile" data-episode="${episode.number}" aria-pressed="${episode.number === playbackEpisode}" ${locked ? 'disabled' : ''}><span class="episode-number">Episode ${episode.number}</span><strong>${escapeHtml(episode.name || 'Episode ' + episode.number)}</strong><span class="episode-release">${episode.air_date ? 'Scheduled · ' + escapeHtml(episode.air_date) : 'Release date not announced'}</span></button>`).join('');
    $('#episode-tiles').querySelectorAll('[data-episode]').forEach(button => button.addEventListener('click', () => playSelectedEpisode(Number(button.dataset.episode),playbackProgress()[playerProgressKey()])));
}
function playSelectedEpisode(number, progress, internalCall = false) {
    if (activeParty && !activeParty.is_host && !applyingPartyState && !internalCall) {
        notify('Only the watch party admin can change the episode.');
        return;
    }
    const episode = seasonEpisodes.find(item => item.number === number);
    if (!episode || playbackData?.type !== 'tv') return;
    persistPlaybackProgress(false,true);
    playbackEpisode = episode.number;
    $('#episode-message').textContent = '';
    renderEpisodeTiles();
    mountPlayer(progress);
    if (activeParty?.is_host && !applyingPartyState) {
        pushPartyState(progress?.season === playbackSeason && progress?.episode === playbackEpisode ? Math.floor(progress?.position || 0) : 0, false);
    }
}
async function navigatePlayerEpisode(season, episode) {
    if (activeParty && !activeParty.is_host && !applyingPartyState) return;
    if (!playbackData.seasons.some(item => item.number === season) || !Number.isInteger(episode)) return;
    const version = playbackVersion;
    persistPlaybackProgress(false,true);
    if (season !== playbackSeason) {
        $('#player-season').value = String(season);
        if (!await loadSeasonEpisodes()) return;
    }
    if (version !== playbackVersion || season !== playbackSeason) return;
    if (!seasonEpisodes.some(item => item.number === episode)) {
        $('#player-frame').innerHTML = '';
        latestPlaybackTime = null;
        playbackStarted = false;
    }
    playSelectedEpisode(episode, undefined, true);
}
function mountPlayer(progress) {
    if (!playbackData) return;
    if (playbackData.type === 'tv') {
        playbackSeason = Number($('#player-season').value);
        if (!selectedSeason() || !seasonEpisodes.some(episode => episode.number === playbackEpisode)) return;
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
    const minPosition = activeParty && !activeParty.is_host ? 0 : 10;
    if (sameEpisode && Number.isFinite(progress?.position) && progress.position > minPosition && progress.position < 604800) url.searchParams.set('t', String(Math.floor(progress.position)));
    latestPlaybackTime = sameEpisode && Number.isFinite(progress?.position) && progress.position > 0 ? {position:Math.floor(progress.position), duration:progress.duration || 0} : null;
    lastProgressWrite = 0;
    playbackStarted = false;
    lastHistoryWrite = 0;
    $('#player-frame').innerHTML = `<iframe id="cinesrc-player" src="${escapeHtml(url.href)}" title="${escapeHtml(playbackTitle.title)} video player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
    $('#player-status').textContent = activeParty && !activeParty.is_host
        ? `Synced with ${activeParty.host_name}’s watch party · Press play in the player.`
        : 'Press play in the player. If a source fails, try another server inside the player.';
    renderPartyBar();
}
function handlePlayerMessage(event) {
    const iframe = $('#cinesrc-player');
    if (!playbackData || event.origin !== playerOrigin || !iframe || event.source !== iframe.contentWindow || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (data.type === 'cinesrc:close') { closePlayer(); return; }
    if (data.type === 'cinesrc:error') { $('#player-status').textContent = 'The provider couldn’t play this source. Try another server inside the player.'; return; }
    if (data.type === 'cinesrc:play') {
        playbackStarted = true;
        $('#player-status').textContent = 'Now playing · CineSrc';
        if (activeParty?.is_host) pushPartyState(Math.floor(latestPlaybackTime?.position || 0), true);
    }
    if (data.type === 'cinesrc:nextepisode' && playbackData.type === 'tv') {
        if (activeParty && !activeParty.is_host) return;
        navigatePlayerEpisode(data.season,data.episode);
        return;
    }
    if (Number.isFinite(data.currentTime) && Number.isFinite(data.duration) && data.duration > 0 && data.duration < 604800 && data.currentTime >= 0 && data.currentTime <= data.duration + 1) {
        latestPlaybackTime = {position:data.currentTime, duration:data.duration};
    }
    if (!latestPlaybackTime || !['cinesrc:timeupdate','cinesrc:pause','cinesrc:seeked','cinesrc:ended'].includes(data.type)) return;
    if (activeParty?.is_host && ['cinesrc:pause','cinesrc:seeked','cinesrc:ended'].includes(data.type)) {
        pushPartyState(Math.floor(latestPlaybackTime.position), data.type === 'cinesrc:seeked' && playbackStarted);
    }
    if (data.type === 'cinesrc:timeupdate' && Date.now() - lastProgressWrite < 10000) return;
    persistPlaybackProgress(data.type === 'cinesrc:ended', data.type !== 'cinesrc:timeupdate');
    if (activeParty?.is_host && data.type === 'cinesrc:timeupdate') {
        pushPartyState(Math.floor(latestPlaybackTime.position), playbackStarted);
    }
}
function persistPlaybackProgress(ended = false, syncHistory = false) {
    if (!playbackData || !latestPlaybackTime) return;
    const progress = playbackProgress();
    const finished = ended || (latestPlaybackTime.duration > 0 && latestPlaybackTime.position / latestPlaybackTime.duration > .95);
    progress[playerProgressKey()] = {...latestPlaybackTime,position:finished ? 0 : latestPlaybackTime.position,season:playbackSeason,episode:playbackEpisode,updatedAt:Date.now()};
    write('void.playback.v1', progress);
    lastProgressWrite = Date.now();
    if (playbackStarted && latestPlaybackTime.position >= 5 && latestPlaybackTime.duration >= 5 && typeof queueWatchHistory === 'function' && (syncHistory || Date.now() - lastHistoryWrite >= 30000)) {
        lastHistoryWrite = Date.now();
        queueWatchHistory(playbackProfileId, playbackTitle, {
            position:Math.min(Math.floor(latestPlaybackTime.position),Math.floor(latestPlaybackTime.duration)), duration:Math.floor(latestPlaybackTime.duration),
            season:playbackData.type === 'tv' ? playbackSeason : null, episode:playbackData.type === 'tv' ? playbackEpisode : null, finished,
        });
    }
}

function partyInviteUrl(code) {
    const origin = window.location?.origin || 'https://the-void.local';
    const path = window.location?.pathname || '/';
    return origin + path + '?party=' + encodeURIComponent(code);
}
function partyStatePayload(positionOverride = null, isPlayingOverride = null) {
    if (!playbackTitle) return null;
    const isSeries = playbackTitle.type === 'Series' || playbackData?.type === 'tv';
    const pos = positionOverride !== null ? positionOverride : Math.floor(latestPlaybackTime?.position || 0);
    return {
        title_key: playbackTitle.id,
        ...titlePayload(playbackTitle),
        type: isSeries ? 'Series' : 'Movies',
        season: isSeries ? Number(playbackSeason || 1) : null,
        episode: isSeries ? Number(playbackEpisode || 1) : null,
        position: Math.max(0, Math.min(604800, pos)),
        is_playing: isPlayingOverride !== null ? Boolean(isPlayingOverride) : Boolean(playbackStarted),
    };
}
function renderPartyBar() {
    const locked = Boolean(activeParty && !activeParty.is_host);
    $('#player-season').disabled = locked;
    if (!activeParty) {
        $('#party-bar').hidden = true;
        $('#party-start').hidden = false;
        $('#party-start').disabled = partyBusy;
        return;
    }
    const isHost = Boolean(activeParty.is_host);
    const members = Array.isArray(activeParty.members) ? activeParty.members : [];
    $('#party-start').hidden = true;
    $('#party-bar').hidden = false;
    $('#party-role-badge').textContent = isHost ? 'ADMIN · HOST' : 'GUEST · LOCKED';
    $('#party-summary').textContent = isHost
        ? `Room ${activeParty.code} · Only you can change or control the movie.`
        : `Hosted by ${activeParty.host_name} · Only the host can change or manipulate the movie.`;
    $('#party-members').textContent = `${members.length || 1} watching`;
    $('#party-sync').hidden = isHost;
    $('#party-end').textContent = isHost ? 'End party' : 'Leave party';
}
async function copyPartyInviteLink() {
    if (!activeParty) return;
    const link = partyInviteUrl(activeParty.code);
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(link);
            notify('Invite link copied: ' + link);
            return;
        }
    } catch {}
    notify('Share this invite link: ' + link);
}
function stopPartyPolling() {
    if (partyPollTimer) {
        clearTimeout(partyPollTimer);
        partyPollTimer = null;
    }
}
function schedulePartyPoll() {
    stopPartyPolling();
    if (!activeParty) return;
    partyPollTimer = setTimeout(async () => {
        await pollWatchParty();
        if (activeParty) schedulePartyPoll();
    }, 4000);
}
async function startWatchParty() {
    if (partyBusy || !activeProfile || !playbackTitle || !playbackData) return;
    if (playbackData.type === 'tv' && !playbackEpisode) {
        notify('Select an episode before starting a watch party.');
        return;
    }
    partyBusy = true;
    renderPartyBar();
    try {
        const result = await profileRequest('/party', 'POST', partyStatePayload());
        activeParty = result.party;
        renderPartyBar();
        renderEpisodeTiles();
        schedulePartyPoll();
        await copyPartyInviteLink();
    } catch (error) {
        notify(error.message);
    } finally {
        partyBusy = false;
        renderPartyBar();
    }
}
async function pushPartyState(positionOverride = null, isPlayingOverride = null) {
    if (!activeParty || !activeParty.is_host || !playbackTitle) return;
    const payload = partyStatePayload(positionOverride, isPlayingOverride);
    if (!payload) return;
    try {
        const result = await profileRequest('/party/' + encodeURIComponent(activeParty.code), 'PUT', payload);
        if (activeParty?.code === result.party?.code) {
            activeParty = result.party;
            renderPartyBar();
        }
    } catch (error) {
        notify(error.message);
    }
}
async function applyPartyToGuestPlayer(party, forceRemount = false) {
    if (!party?.title || typeof party.title.id !== 'string') return;
    titleIndex.set(party.title.id, party.title);
    const targetProgress = {
        position: Number(party.position || 0),
        season: party.season ?? 1,
        episode: party.episode ?? 1,
    };
    const titleChanged = !playbackTitle || playbackTitle.id !== party.title_key || !playbackData;
    const episodeChanged = party.title.type === 'Series' && (playbackSeason !== party.season || playbackEpisode !== party.episode);
    const localPosition = latestPlaybackTime?.position ?? null;
    const drifted = localPosition !== null && Math.abs(localPosition - targetProgress.position) > 15;

    if (!titleChanged && !episodeChanged && !forceRemount && !drifted) {
        if (!$('#player').open) $('#player').showModal();
        return;
    }
    applyingPartyState = true;
    try {
        if (titleChanged) {
            await openPlayer(party.title_key, targetProgress);
        } else if (episodeChanged && playbackData?.type === 'tv') {
            await navigatePlayerEpisode(party.season, party.episode);
            mountPlayer(targetProgress);
        } else {
            mountPlayer(targetProgress);
        }
    } finally {
        applyingPartyState = false;
        renderPartyBar();
        renderEpisodeTiles();
    }
}
async function joinWatchParty(code) {
    if (!activeProfile || !profilesReady || partyBusy) return false;
    partyBusy = true;
    try {
        const result = await profileRequest('/party/' + encodeURIComponent(code), 'GET');
        activeParty = result.party;
        renderPartyBar();
        await applyPartyToGuestPlayer(activeParty, true);
        schedulePartyPoll();
        notify(activeParty.is_host ? 'Reconnected to your watch party.' : `Joined ${activeParty.host_name}’s watch party.`);
        return true;
    } catch (error) {
        notify(error.message);
        return false;
    } finally {
        partyBusy = false;
        renderPartyBar();
    }
}
async function pollWatchParty(forceSync = false) {
    if (!activeParty || !activeProfile) return;
    const code = activeParty.code;
    try {
        const result = await profileRequest('/party/' + encodeURIComponent(code), 'GET');
        if (!activeParty || activeParty.code !== code) return;
        activeParty = result.party;
        renderPartyBar();
        if (!activeParty.is_host) {
            await applyPartyToGuestPlayer(activeParty, forceSync);
        }
    } catch (error) {
        if (/ended|not exist/i.test(error.message)) {
            stopPartyPolling();
            activeParty = null;
            renderPartyBar();
            renderEpisodeTiles();
            notify('The watch party has ended.');
        }
    }
}
async function leaveWatchParty(silent = false) {
    if (!activeParty) return;
    const party = activeParty;
    stopPartyPolling();
    activeParty = null;
    renderPartyBar();
    renderEpisodeTiles();
    try {
        await profileRequest('/party/' + encodeURIComponent(party.code), 'DELETE');
        if (!silent) {
            notify(party.is_host ? 'Watch party ended for everyone.' : 'You left the watch party.');
        }
    } catch (error) {
        if (!silent) notify(error.message);
    }
}
async function enterPendingWatchParty() {
    if (!pendingPartyCode || !activeProfile) return;
    const code = pendingPartyCode;
    pendingPartyCode = null;
    await joinWatchParty(code);
}

window.addEventListener('message', handlePlayerMessage);
window.addEventListener('pagehide', () => persistPlaybackProgress(false, true));
$('#close-player').addEventListener('click', closePlayer);
$('#player').addEventListener('cancel', event => { event.preventDefault(); closePlayer(); });
$('#player-season').addEventListener('change', () => {
    if (activeParty && !activeParty.is_host && !applyingPartyState) {
        $('#player-season').value = String(playbackSeason);
        notify('Only the watch party admin can change the season.');
        return;
    }
    persistPlaybackProgress(false,true);
    loadSeasonEpisodes();
});
$('#retry-episodes').addEventListener('click', () => loadSeasonEpisodes());
$('#retry-player').addEventListener('click', () => openPlayer(playbackTitle.id));
$('#party-start').addEventListener('click', startWatchParty);
$('#party-copy').addEventListener('click', copyPartyInviteLink);
$('#party-sync').addEventListener('click', () => pollWatchParty(true));
$('#party-end').addEventListener('click', () => leaveWatchParty(false));
