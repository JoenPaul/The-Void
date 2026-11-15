const playerOrigin = 'https://cinesrc.st';
let playbackVersion = 0, playbackController, playbackTitle, playbackData, playbackProfileId;
let playbackSeason = 1, playbackEpisode = 1, lastProgressWrite = 0, latestPlaybackTime = null;
let playbackStarted = false, playbackPlaying = false, playerReady = false, playerPartyCode = null, lastHistoryWrite = 0;
let episodeRequestVersion = 0, episodeController, seasonEpisodes = [];
let activeParty = null, partyPollTimer = null, pendingPartyCode = null, applyingPartyState = false, partyBusy = false;
let partyPollRequest = null, partyStateWrite = Promise.resolve();
let partyInvitations = [], invitationPollTimer = null, invitationPollController = null;
let invitationPanelPinned = false, renderedInvitationList = '';

try {
    const partyParam = new URLSearchParams(window.location?.search || '').get('party');
    if (partyParam && /^[A-Za-z0-9]{6,24}$/.test(partyParam)) pendingPartyCode = partyParam;
} catch {}

const playbackProgress = () => {
    const progress = read('void.playback.v1', {});
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
};
function playerProgressKey() { return playbackProfileId + ':' + playbackTitle.id; }
function closePlayer(leaveParty = true) {
    if (activeParty?.is_host && playbackData && playbackPlaying) pushPartyState(null, false);
    persistPlaybackProgress(false, true);
    playbackVersion++;
    playbackController?.abort();
    episodeRequestVersion++;
    episodeController?.abort();
    $('#player-frame').innerHTML = '';
    $('#player').close();
    playbackData = null;
    seasonEpisodes = [];
    if (leaveParty && activeParty && !activeParty.is_host) leaveWatchParty();
}
async function openPlayer(id, partyProgress = null) {
    if (activeParty && !activeParty.is_host && !partyProgress) {
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
            if (activeParty?.is_host && !applyingPartyState) await pushPartyState();
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
            const resumeSeason = data.seasons.find(season => season.number === resumeProgress?.season);
            if (partyProgress && !resumeSeason) throw new Error('Party season unavailable');
            playbackSeason = (resumeSeason || data.seasons.find(season => season.number > 0) || data.seasons[0]).number;
            $('#player-season').value = String(playbackSeason);
            $('#episode-controls').hidden = false;
            renderPartyBar();
            await loadSeasonEpisodes(resumeProgress,true);
        } else {
            mountPlayer(resumeProgress);
            if (activeParty?.is_host && !applyingPartyState) await pushPartyState();
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
    playbackPlaying = false;
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
            if (!resume && activeParty && !activeParty.is_host) {
                $('#player-status').textContent = 'The host’s episode is unavailable.';
                return false;
            }
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
        pushPartyState();
    }
}
async function navigatePlayerEpisode(season, episode, progress = null) {
    if (activeParty && !activeParty.is_host && !progress) return;
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
    playSelectedEpisode(episode, progress, true);
}
function mountPlayer(progress) {
    if (!playbackData) return;
    if (playbackData.type === 'tv') {
        playbackSeason = Number($('#player-season').value);
        if (!selectedSeason() || !seasonEpisodes.some(episode => episode.number === playbackEpisode)) return;
    }
    const url = new URL(playerOrigin + '/embed/' + playbackData.type + '/' + playbackData.id);
    url.searchParams.set('color', '#9959ff');
    const isGuest = Boolean(activeParty && !activeParty.is_host);
    playerPartyCode = isGuest ? activeParty.code : null;
    url.searchParams.set('autoplay', String(isGuest && activeParty.is_playing));
    if (isGuest) url.searchParams.set('continueprompt', 'false');
    url.searchParams.set('autonext', 'false');
    url.searchParams.set('back', 'close');
    if (playbackData.type === 'tv') {
        url.searchParams.set('s', String(playbackSeason));
        url.searchParams.set('e', String(playbackEpisode));
    }
    const sameEpisode = playbackData.type === 'movie' || (progress?.season === playbackSeason && progress?.episode === playbackEpisode);
    const startPosition = sameEpisode && Number.isFinite(progress?.position) && progress.position >= 0 && progress.position < 604800 ? Math.floor(progress.position) : 0;
    if (isGuest || startPosition > 10) url.searchParams.set('t', String(startPosition));
    latestPlaybackTime = sameEpisode && Number.isFinite(progress?.position) && progress.position > 0 ? {position:Math.floor(progress.position), duration:progress.duration || 0} : null;
    lastProgressWrite = 0;
    playbackStarted = false;
    playbackPlaying = false;
    playerReady = false;
    lastHistoryWrite = 0;
    $('#player-frame').innerHTML = `<iframe id="cinesrc-player" src="${escapeHtml(url.href)}" title="${escapeHtml(playbackTitle.title)} video player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
    $('#player-status').textContent = activeParty && !activeParty.is_host
        ? `Following ${activeParty.host_name}’s watch party.`
        : 'Press play in the player. If a source fails, try another server inside the player.';
    renderPartyBar();
}
function handlePlayerMessage(event) {
    const iframe = $('#cinesrc-player');
    if (!playbackData || event.origin !== playerOrigin || !iframe || event.source !== iframe.contentWindow || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (data.type === 'cinesrc:close') { closePlayer(); return; }
    if (data.type === 'cinesrc:error') { $('#player-status').textContent = 'The provider couldn’t play this source. Try another server inside the player.'; return; }
    if (Number.isFinite(data.currentTime) && Number.isFinite(data.duration) && data.duration > 0 && data.duration < 604800 && data.currentTime >= 0 && data.currentTime <= data.duration + 1) {
        latestPlaybackTime = {position:data.currentTime, duration:data.duration};
    }
    if (data.type === 'cinesrc:loadedmetadata') {
        playerReady = true;
        syncGuestPlayback(true);
    }
    if (data.type === 'cinesrc:play') {
        playbackStarted = true;
        playbackPlaying = true;
        $('#player-status').textContent = 'Now playing · CineSrc';
        if (activeParty?.is_host) pushPartyState();
    }
    if (data.type === 'cinesrc:pause' || data.type === 'cinesrc:ended') {
        playbackPlaying = false;
        if (activeParty?.is_host) pushPartyState();
    }
    if (data.type === 'cinesrc:nextepisode' && playbackData.type === 'tv') {
        if (activeParty && !activeParty.is_host) {
            if (data.internalNavigation) mountPlayer(guestPartyProgress(activeParty));
            return;
        }
        navigatePlayerEpisode(data.season,data.episode);
        return;
    }
    if (activeParty && !activeParty.is_host) return;
    if (!latestPlaybackTime || !['cinesrc:timeupdate','cinesrc:pause','cinesrc:seeked','cinesrc:ended'].includes(data.type)) return;
    if (activeParty?.is_host && data.type === 'cinesrc:seeked') pushPartyState();
    if (data.type === 'cinesrc:timeupdate' && Date.now() - lastProgressWrite < 10000) return;
    persistPlaybackProgress(data.type === 'cinesrc:ended', data.type !== 'cinesrc:timeupdate');
    if (activeParty?.is_host && data.type === 'cinesrc:timeupdate') {
        pushPartyState();
    }
}
function persistPlaybackProgress(ended = false, syncHistory = false) {
    if (!playbackData || !latestPlaybackTime || (activeParty && !activeParty.is_host)) return;
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
        is_playing: isPlayingOverride !== null ? Boolean(isPlayingOverride) : playbackPlaying,
    };
}
function renderPartyBar() {
    const locked = Boolean(activeParty && !activeParty.is_host);
    $('#player-season').disabled = locked;
    renderPartyInvitations();
    $('#party-invite').hidden = !activeParty?.is_host;
    $('#party-invite').disabled = !profiles.some(profile => profile.id !== activeProfile?.id);
    if (!activeParty?.is_host) {
        $('#party-invite-form').hidden = true;
        $('#party-invite').setAttribute('aria-expanded', 'false');
    }
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
    const endLabel = isHost ? 'End party' : 'Leave party';
    $('#party-end-label').textContent = endLabel;
    $('#party-end').setAttribute('aria-label', endLabel);
    $('#party-end').title = endLabel;
}
function renderPartyInvitations() {
    const visibleInvitations = partyInvitations.filter(invitation => invitation.code !== activeParty?.code);
    const count = visibleInvitations.length;
    const badge = $('#party-invitation-count');
    $('#party-notifications').hidden = !activeProfile;
    $('#party-notification-toggle').setAttribute('aria-label', count ? `Watch party invitations (${count})` : 'Watch party invitations');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    $('#party-invitations-empty').hidden = count !== 0;
    const markup = visibleInvitations.map(invitation => `<li><div><strong>${escapeHtml(invitation.title)}</strong><br><small>Invited by ${escapeHtml(invitation.host_name)}</small></div><button type="button" class="secondary" data-party-join="${escapeHtml(invitation.code)}" aria-label="Join watch party for ${escapeHtml(invitation.title)}">Join</button></li>`).join('');
    if (renderedInvitationList !== markup) {
        const list = $('#party-invitations-list');
        const focusedCode = list.contains(document.activeElement) ? document.activeElement.dataset.partyJoin : null;
        list.innerHTML = markup;
        renderedInvitationList = markup;
        if (focusedCode && !$('#party-invitations').hidden) {
            const button = Array.from(list.querySelectorAll('[data-party-join]')).find(item => item.dataset.partyJoin === focusedCode);
            (button || $('#party-notification-toggle')).focus();
        }
    }
}
function showInvitationPanel(open) {
    const wasHidden = $('#party-invitations').hidden;
    $('#party-invitations').hidden = !open;
    $('#party-notification-toggle').setAttribute('aria-expanded', String(open));
    if (!open) invitationPanelPinned = false;
    if (open && wasHidden && invitationPollTimer !== null) pollPartyInvitations();
}
function stopPartyInvitationPolling() {
    invitationPollController?.abort();
    clearTimeout(invitationPollTimer);
    invitationPollTimer = null;
    partyInvitations = [];
    showInvitationPanel(false);
    renderPartyInvitations();
}
function startPartyInvitationPolling() {
    stopPartyInvitationPolling();
    invitationPollController = new AbortController();
    return pollPartyInvitations();
}
async function pollPartyInvitations() {
    clearTimeout(invitationPollTimer);
    invitationPollTimer = null;
    const {signal} = invitationPollController;
    const profileId = activeProfile?.id;
    const previousInvitations = partyInvitations;
    try {
        const result = await profileRequest('/party-invitations', 'GET', undefined, {signal});
        if (!signal.aborted && activeProfile?.id === profileId && previousInvitations === partyInvitations) {
            partyInvitations = Array.isArray(result.invitations) ? result.invitations : [];
            renderPartyInvitations();
        }
    } catch {} finally {
        if (!signal.aborted && activeProfile?.id === profileId) {
            invitationPollTimer = setTimeout(pollPartyInvitations, $('#party-invitations').hidden ? 15000 : 5000);
        }
    }
}
function togglePartyInviteForm() {
    if (!activeParty?.is_host) return;
    const form = $('#party-invite-form');
    form.hidden = !form.hidden;
    $('#party-invite').setAttribute('aria-expanded', String(!form.hidden));
    if (form.hidden) return;
    const select = $('#party-invite-profile');
    select.innerHTML = '<option value="">Choose a profile</option>' + profiles.filter(profile => profile.id !== activeProfile.id)
        .map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`).join('');
    $('#party-invite-status').textContent = '';
    select.focus();
}
async function sendPartyInvitation(event) {
    event.preventDefault();
    const profileId = $('#party-invite-profile').value;
    const submit = $('#party-invite-send');
    if (!activeParty?.is_host || !profileId || submit.disabled) return;
    const code = activeParty.code;
    const status = $('#party-invite-status');
    submit.disabled = true;
    status.textContent = '';
    try {
        await profileRequest('/party/' + encodeURIComponent(code) + '/invitations', 'PUT', {profile_id:profileId});
        if (activeParty?.code === code) status.textContent = 'Invitation sent.';
    } catch (error) {
        if (activeParty?.code === code) status.textContent = error.status === 404 ? 'This watch party has ended.' : error.message;
    } finally {
        submit.disabled = false;
    }
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
function pushPartyState(positionOverride = null, isPlayingOverride = null) {
    if (!activeParty || !activeParty.is_host || !playbackTitle) return;
    const code = activeParty.code;
    const payload = partyStatePayload(positionOverride, isPlayingOverride);
    partyStateWrite = partyStateWrite.then(async () => {
        if (activeParty?.code !== code) return;
        try {
            const result = await profileRequest('/party/' + encodeURIComponent(code), 'PUT', payload);
            if (activeParty?.code === code) {
                activeParty = result.party;
                renderPartyBar();
            }
        } catch (error) {
            if (activeParty?.code === code) notify(error.message);
        }
    });
    return partyStateWrite;
}
function guestPartyProgress(party) {
    return {
        position: Number(party.position || 0),
        season: party.season ?? 1,
        episode: party.episode ?? 1,
    };
}
function syncGuestPlayback(force = false) {
    if (!activeParty || activeParty.code !== playerPartyCode || !playerReady || playbackTitle?.id !== activeParty.title_key) return;
    if (playbackData.type === 'tv' && (playbackSeason !== activeParty.season || playbackEpisode !== activeParty.episode)) return;
    const iframe = $('#cinesrc-player');
    if (!iframe) return;
    const position = guestPartyProgress(activeParty).position;
    const send = (command, args = []) => iframe.contentWindow.postMessage({type:'cinesrc:command', command, args}, playerOrigin);
    const drift = Math.abs((latestPlaybackTime?.position ?? 0) - position);
    if (!activeParty.is_playing && (playbackPlaying || force)) send('pause');
    if (force || drift > (activeParty.is_playing ? 3 : 1)) send('seek', [position]);
    if (activeParty.is_playing && !playbackPlaying) send('play');
}
async function applyPartyToPlayer(party, forceSync = false) {
    if (!party?.title || typeof party.title.id !== 'string') return;
    titleIndex.set(party.title.id, party.title);
    const targetProgress = guestPartyProgress(party);
    const titleChanged = !playbackTitle || playbackTitle.id !== party.title_key || !playbackData;
    const episodeChanged = party.title.type === 'Series' && (playbackSeason !== party.season || playbackEpisode !== party.episode);
    const needsMount = party.is_host || playerPartyCode !== party.code || (forceSync && !playerReady);
    if (!titleChanged && !episodeChanged && !needsMount) {
        syncGuestPlayback(forceSync);
        return;
    }
    applyingPartyState = true;
    try {
        if (titleChanged) {
            await openPlayer(party.title_key, targetProgress);
        } else if (episodeChanged && playbackData?.type === 'tv') {
            await navigatePlayerEpisode(party.season, party.episode, targetProgress);
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
    if (activeParty && activeParty.code !== code) {
        notify('Leave your current watch party before joining another.');
        return false;
    }
    partyBusy = true;
    try {
        const result = await profileRequest('/party/' + encodeURIComponent(code), 'GET');
        activeParty = result.party;
        renderPartyBar();
        await applyPartyToPlayer(activeParty, true);
        if (activeParty?.code !== code) return false;
        schedulePartyPoll();
        notify(activeParty.is_host ? 'Reconnected to your watch party.' : `Joined ${activeParty.host_name}’s watch party.`);
        return true;
    } catch (error) {
        if (error.status === 404) {
            partyInvitations = partyInvitations.filter(invitation => invitation.code !== code);
            notify('This watch party has ended or does not exist.');
        } else {
            notify(error.message);
        }
        return false;
    } finally {
        partyBusy = false;
        renderPartyBar();
    }
}
async function pollWatchParty(forceSync = false) {
    if (!activeParty || !activeProfile || partyBusy) return;
    if (partyPollRequest) {
        await partyPollRequest;
        if (forceSync) return pollWatchParty(true);
        return;
    }
    partyPollRequest = refreshWatchParty(forceSync);
    try {
        await partyPollRequest;
    } finally {
        partyPollRequest = null;
    }
}
async function refreshWatchParty(forceSync) {
    const code = activeParty.code;
    try {
        const result = await profileRequest('/party/' + encodeURIComponent(code), 'GET');
        if (!activeParty || activeParty.code !== code) return;
        if (!activeParty.is_host) activeParty = result.party;
        else activeParty.members = result.party.members;
        renderPartyBar();
        if (!activeParty.is_host) {
            await applyPartyToPlayer(activeParty, forceSync);
        }
    } catch (error) {
        if (activeParty?.code === code && error.status === 404) {
            stopPartyPolling();
            if (!activeParty.is_host) closePlayer(false);
            activeParty = null;
            partyInvitations = partyInvitations.filter(invitation => invitation.code !== code);
            renderPartyBar();
            renderEpisodeTiles();
            notify('The watch party has ended.');
        }
    }
}
async function leaveWatchParty(silent = false) {
    if (!activeParty) return;
    const party = activeParty;
    if (party.is_host) {
        const endButton = $('#party-end');
        if (endButton.disabled) return;
        endButton.disabled = true;
        try {
            const result = await profileRequest('/party/' + encodeURIComponent(party.code), 'DELETE');
            if (!result.ended) throw new Error('The room is still open. Sign in as the host and try again.');
        } catch (error) {
            if (error.status !== 404) {
                if (silent) throw error;
                notify(error.message);
                return;
            }
        } finally {
            endButton.disabled = false;
        }
    }
    if (activeParty?.code !== party.code) return;
    stopPartyPolling();
    if (!party.is_host && $('#player').open) closePlayer(false);
    activeParty = null;
    renderPartyBar();
    renderEpisodeTiles();
    try {
        if (!party.is_host) await profileRequest('/party/' + encodeURIComponent(party.code), 'DELETE');
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
$('#close-player').addEventListener('click', () => closePlayer());
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
$('#retry-episodes').addEventListener('click', () => activeParty && !activeParty.is_host ? pollWatchParty(true) : loadSeasonEpisodes());
$('#retry-player').addEventListener('click', () => activeParty && !activeParty.is_host ? pollWatchParty(true) : openPlayer(playbackTitle.id));
$('#party-start').addEventListener('click', startWatchParty);
$('#party-invite').addEventListener('click', togglePartyInviteForm);
$('#party-invite-form').addEventListener('submit', sendPartyInvitation);
$('#party-notification-toggle').addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' && $('#profile-menu').hidden) showInvitationPanel(true);
});
$('#party-notifications').addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && !invitationPanelPinned && !$('#party-invitations').contains(document.activeElement)) showInvitationPanel(false);
});
$('#party-notification-toggle').addEventListener('click', () => {
    invitationPanelPinned = !invitationPanelPinned;
    showInvitationPanel(invitationPanelPinned);
});
$('#party-notifications').addEventListener('focusout', event => {
    if (event.relatedTarget && !$('#party-notifications').contains(event.relatedTarget)) showInvitationPanel(false);
});
document.addEventListener('pointerdown', event => {
    if (!$('#party-invitations').hidden && !$('#party-notifications').contains(event.target)) showInvitationPanel(false);
});
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || $('#party-invitations').hidden) return;
    if ($('#party-notifications').contains(document.activeElement)) $('#party-notification-toggle').focus();
    showInvitationPanel(false);
});
$('#party-invitations-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-party-join]');
    if (button && await joinWatchParty(button.dataset.partyJoin)) showInvitationPanel(false);
});
$('#party-copy').addEventListener('click', copyPartyInviteLink);
$('#party-sync').addEventListener('click', () => pollWatchParty(true));
$('#party-end').addEventListener('click', () => leaveWatchParty(false));
