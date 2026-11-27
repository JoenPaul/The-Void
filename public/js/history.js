const watchedByProfile = new Map(), historyLoaded = new Set(), historyLoading = new Set(), historyErrors = new Map();
const historyMutations = new Map(), historyWrites = new Map();
async function loadWatchHistory(profileId, force = false) {
    if (!profilesReady || historyLoading.has(profileId) || (!force && (historyLoaded.has(profileId) || historyErrors.has(profileId)))) { renderWatchHistory(); return; }
    historyLoading.add(profileId);
    historyErrors.delete(profileId);
    const mutation = historyMutations.get(profileId) || 0;
    renderWatchHistory();
    try {
        const data = await profileRequest('/profiles/' + encodeURIComponent(profileId) + '/history');
        if (!Array.isArray(data.entries)) throw new Error('Invalid history');
        if ((historyMutations.get(profileId) || 0) === mutation) watchedByProfile.set(profileId, data.entries);
        data.entries.forEach(movie => titleIndex.set(movie.id,movie));
        historyLoaded.add(profileId);
        restoreHistoryProgress(profileId, watchedByProfile.get(profileId) || []);
    } catch { historyErrors.set(profileId,'Your recently watched titles couldn’t load. Please try again.'); }
    finally { historyLoading.delete(profileId); renderWatchHistory(); }
}
function restoreHistoryProgress(profileId, entries) {
    const progress = read('void.playback.v1', {});
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return;
    let restored = false;
    entries.forEach(entry => {
        const key = profileId + ':' + entry.id;
        const remoteTime = Date.parse(entry.watched_at);
        if (!progress[key] || (progress[key].updatedAt && progress[key].updatedAt < remoteTime)) {
            progress[key] = {position:entry.finished ? 0 : entry.position,duration:entry.duration,season:entry.season,episode:entry.episode,updatedAt:remoteTime};
            restored = true;
        }
    });
    if (restored) write('void.playback.v1', progress);
}
function renderWatchHistory() {
    const visible = !!activeProfile && page === 'Discover' && !query;
    $('#recently-watched').hidden = !visible;
    if (!visible) return;
    const id = activeProfile.id;
    const entries = watchedByProfile.get(id) || [];
    $('#recent-profile').textContent = 'For ' + activeProfile.name;
    $('#recent-status').textContent = historyErrors.get(id) || (historyLoading.has(id) ? 'Loading your recent titles…' : '');
    $('#retry-history').hidden = !historyErrors.has(id);
    $('#recent-content').innerHTML = entries.length ? `<div class="recent-grid">${entries.map(entry => {
        const date = new Date(entry.watched_at);
        const when = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(date);
        const episodeBadge = entry.type === 'Series' ? `S${String(entry.season).padStart(2,'0')} · E${String(entry.episode).padStart(2,'0')}` : 'MOVIE';
        const episode = entry.type === 'Series' ? `${episodeBadge} · ` : '';
        const status = entry.finished ? 'Watched' : Math.floor(entry.position / 60) > 0 ? `${Math.floor(entry.position / 60)} min watched` : 'Just started';
        const percent = Math.max(0,Math.min(100,entry.finished ? 100 : (entry.position / entry.duration) * 100));
        return card(entry).replace('class="movie-card"','class="movie-card recent-card"').replace('</button>',`<span class="recent-top-row"><span class="recent-ep-badge">${escapeHtml(episodeBadge)}</span><span class="recent-time-pill">${escapeHtml(status)}</span></span><p class="recent-caption">${escapeHtml(episode + status)}<span>${escapeHtml(when)}</span></p><span class="recent-progress" aria-hidden="true"><span style="width:${percent}%"></span></span></button>`);
    }).join('')}</div>` : !historyLoading.has(id) && !historyErrors.has(id) ? '<p class="history-empty">Your next movie night starts here. Titles appear after you begin watching.</p>' : '';
    $('#recent-content').querySelectorAll('[data-movie]').forEach(button => button.addEventListener('click', () => openPlayer(button.dataset.movie)));
    bindSaveButtons($('#recent-content'));
    handleImageErrors($('#recent-content'));
}
async function queueWatchHistory(profileId, movie, progress) {
    const key = profileId + ':' + movie.id;
    let state = historyWrites.get(key);
    if (state) { state.pending = progress; return state.promise; }
    state = {pending:progress,promise:null};
    historyWrites.set(key,state);
    state.promise = (async () => {
        try {
            while (state.pending) {
                const next = state.pending;
                state.pending = null;
                const data = await profileRequest('/profiles/' + encodeURIComponent(profileId) + '/history/' + encodeURIComponent(movie.id), 'PUT', {...titlePayload(movie),...next}, {keepalive:true});
                historyMutations.set(profileId,(historyMutations.get(profileId) || 0) + 1);
                const entries = watchedByProfile.get(profileId) || [];
                watchedByProfile.set(profileId,[data.entry,...entries.filter(entry => entry.id !== movie.id)].slice(0,100));
                titleIndex.set(movie.id,movie);
                historyErrors.delete(profileId);
                renderWatchHistory();
            }
        } catch { historyErrors.set(profileId,'Couldn’t save your latest viewing activity. Your previous history is still here.'); renderWatchHistory(); }
        finally { historyWrites.delete(key); }
    })();
    return state.promise;
}
$('#retry-history').addEventListener('click', () => { if (activeProfile) loadWatchHistory(activeProfile.id,true); });
renderWatchHistory();
if (activeProfile && profilesReady) loadWatchHistory(activeProfile.id);
