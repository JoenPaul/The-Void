const movies = [
    {id:1,title:'Dune: Part Two',year:2024,type:'Movies',genre:'Sci-Fi',rating:'8.5',poster:'1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',description:'Paul Atreides joins the Fremen on a journey of revenge and discovery, caught between the person he loves and the future of the universe.'},
    {id:2,title:'Interstellar',year:2014,type:'Movies',genre:'Sci-Fi',rating:'8.7',poster:'gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',description:'A team of explorers travels beyond this galaxy to discover whether humanity has a future among the stars.'},
    {id:3,title:'The Batman',year:2022,type:'Movies',genre:'Thriller',rating:'7.8',poster:'74xTEgt7R36Fpooo50r9T25onhq.jpg',description:'A masked detective follows a trail through Gotham, uncovering the corruption hidden beneath his city.'},
    {id:4,title:'Spider-Man: Across the Spider-Verse',year:2023,type:'Movies',genre:'Animation',rating:'8.6',poster:'8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',description:'Miles Morales discovers a universe of Spider-People, each with a different idea of what it means to be a hero.'},
    {id:5,title:'Oppenheimer',year:2023,type:'Movies',genre:'Drama',rating:'8.3',poster:'ptpr0kGAckfQkJeJIt8st5dglvd.jpg',description:'A physicist takes on a project that will change the course of history, and faces the consequences of his creation.'},
    {id:6,title:'Dune',year:2021,type:'Movies',genre:'Adventure',rating:'8.0',poster:'d5NXSklXo0qyIYkgV94XAgMIckC.jpg',description:'A young heir arrives on a desert planet where a precious resource and an ancient prophecy shape the fate of an empire.'},
    {id:7,title:'Stranger Things',year:2016,type:'Series',genre:'Sci-Fi',rating:'8.6',poster:'uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg',description:'A group of friends in a small town confronts a mystery that leads to a world beneath their own.'},
    {id:8,title:'The Last of Us',year:2023,type:'Series',genre:'Drama',rating:'8.7',poster:'uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg',description:'Two unlikely companions cross a changed America, discovering what they are willing to do for each other.'},
    {id:9,title:'Breaking Bad',year:2008,type:'Series',genre:'Thriller',rating:'9.5',poster:'3xnWaLQjelJDDF7LT1WBo6f4BRe.jpg',description:'A chemistry teacher makes a desperate decision that draws him into a dangerous double life.'},
    {id:10,title:'The Mandalorian',year:2019,type:'Series',genre:'Action',rating:'8.4',poster:'eU1i6eHXlzMOlEq0ku1RzqRM5Bq.jpg',image:'https://lumiere-a.akamaihd.net/v1/images/5d5fe9394335840001375adf-image_c79fb57f.jpeg',description:'A lone bounty hunter finds an unexpected purpose in the outer reaches of the galaxy.'},
    {id:11,title:'Arcane',year:2021,type:'Series',genre:'Animation',rating:'9.0',poster:'fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg',description:'Two sisters find themselves on opposite sides of a conflict between an affluent city and its underground.'},
    {id:12,title:'House of the Dragon',year:2022,type:'Series',genre:'Adventure',rating:'8.3',poster:'7QMsOTMUswlwxJP0rTTZfmz2tX2.jpg',description:'A royal family fights for the future of a dynasty in an age when dragons rule the skies.'}
];
const $ = (selector) => document.querySelector(selector);
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { notify('Browser storage is unavailable. Changes will last for this visit.'); } };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
let toastTimer;
function notify(message, undo = null) {
    $('#toast').textContent = message;
    if (undo) {
        $('#toast').innerHTML = `<span>${escapeHtml(message)}</span><button id="toast-undo">Undo</button>`;
        $('#toast-undo').addEventListener('click', () => { $('#toast').style.display = 'none'; undo(); });
    }
    $('#toast').style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').style.display = 'none', 3500);
}

const tmdbIds = ['movie:693134','movie:157336','movie:414906','movie:569094','movie:872585','movie:438631','tv:66732','tv:100088','tv:1396','tv:82856','tv:94605','tv:94997'];
movies.forEach((movie, index) => {
    movie.id = tmdbIds[index];
    movie.genres = [movie.genre];
    movie.image = movie.image || 'https://image.tmdb.org/t/p/w500/' + movie.poster;
});
let profiles = read('void.profiles', [{id:'joen',name:'Joen'},{id:'guest',name:'Guest'}]);
if (!Array.isArray(profiles) || !profiles.length || profiles.some(profile => !profile || typeof profile.id !== 'string' || typeof profile.name !== 'string')) {
    profiles = [{id:'guest',name:'Guest'}];
}
let activeProfile = null;
const storedLists = read('void.lists', {});
let savedLists = storedLists && typeof storedLists === 'object' && !Array.isArray(storedLists) ? storedLists : {};
Object.keys(savedLists).forEach(key => {
    savedLists[key] = Array.isArray(savedLists[key])
        ? savedLists[key].map(id => typeof id === 'number' ? tmdbIds[id - 1] : id).filter(id => typeof id === 'string')
        : [];
});
const storedTitles = read('void.saved-titles', []);
const titleIndex = new Map(movies.map(movie => [movie.id, movie]));
if (Array.isArray(storedTitles)) {
    storedTitles.filter(movie => movie && typeof movie.id === 'string' && typeof movie.title === 'string')
        .forEach(movie => titleIndex.set(movie.id, movie));
}
const saved = () => Array.isArray(savedLists[activeProfile?.id]) ? savedLists[activeProfile.id] : [];
let page = 'Discover', genre = 'All', query = '', currentMovie = null;
let catalogCollection = 'popular';
let catalog = [], catalogMode = 'pending', catalogPage = 0, hasMore = false, loading = false;
let catalogGallery = false;
let discoverRows = null;
const discoverCache = new Map();
const pendingRowVisibility = new Map();
let catalogObserver;
function observeCatalogRows() {
    catalogObserver?.disconnect();
    if (typeof IntersectionObserver === 'undefined') return;
    catalogObserver = new IntersectionObserver(entries => {
        entries.filter(entry => entry.isIntersecting).forEach(entry => pendingRowVisibility.get(Number(entry.target.dataset.pendingRow))?.());
    }, {rootMargin:'600px'});
    $('#catalog').querySelectorAll('[data-pending-row]').forEach(element => catalogObserver.observe(element));
}
function waitForCatalogRow(index, signal) {
    if (index < 2 || typeof IntersectionObserver === 'undefined') return Promise.resolve();
    return new Promise(resolve => {
        const finish = () => {
            pendingRowVisibility.delete(index);
            signal.removeEventListener('abort',finish);
            resolve();
        };
        pendingRowVisibility.set(index,finish);
        signal.addEventListener('abort',finish,{once:true});
        observeCatalogRows();
    });
}
function cachedDiscoverRow(descriptor) {
    const key = descriptor.type + ':' + descriptor.genre + (descriptor.collection === 'recent' ? ':recent' : '');
    let cached = discoverCache.get(key);
    if (!cached && typeof sessionStorage !== 'undefined') {
        try { cached = JSON.parse(sessionStorage.getItem('void.genre.' + key)); } catch {}
    }
    return cached && Array.isArray(cached.data?.results) ? cached : null;
}
let requestVersion = 0, requestController, searchTimer, requestFailed = false, unavailableSources = [];
const legacyProfiles = profiles.map(profile => ({...profile}));
const legacyLists = {...savedLists};
const legacyActiveId = activeProfile?.id;
let profilesReady = false, profileBusy = false, editingProfileId = null;
let profileTransition = null;
const pendingSaves = new Set();
const watchlistLoads = new Map(), watchlistErrors = new Map();
const searchCache = new Map();
const avatarSymbols = {moon:'☾',star:'✦',orbit:'◈'};
const avatarFor = profile => avatarSymbols[profile.avatar] || profile.name.slice(0,1).toUpperCase();
const avatarClass = profile => ['violet','moon','star','orbit'].includes(profile.avatar) ? profile.avatar : 'violet';
let viewerToken = null;

async function profileRequest(path, method = 'GET', body, options = {}) {
    const response = await fetch(path, {
        ...options,
        method, credentials:'same-origin',
        headers: {Accept:'application/json', 'Content-Type':'application/json', 'X-CSRF-TOKEN':$('meta[name="csrf-token"]').content,
            ...(/^\/profiles\/[^/]+\/login$/.test(path) ? {'X-Viewer-Tab':'1'} : {}),
            ...(viewerToken ? {'X-Viewer-Token':viewerToken} : {})},
        ...(body ? {body:JSON.stringify(body)} : {}),
    });
    if (!response.ok) {
        if (response.status === 429) throw new Error('Too many attempts. Please wait one minute and try again.');
        if (response.status === 419) throw new Error('Your session expired. Refresh the page and try again.');
        const error = await response.json().catch(() => ({}));
        const failure = new Error(response.status === 422 ? Object.values(error.errors || {}).flat()[0] || 'Please check the profile details.' : ([401,403].includes(response.status) ? error.message : 'Could not reach your saved profiles. Please try again.'));
        failure.status = response.status;
        throw failure;
    }
    const result = await response.json();
    if (result.viewer_token) viewerToken = result.viewer_token;
    if (path === '/profile-logout') viewerToken = null;
    return result;
}
function titlePayload(movie) {
    return {title:movie.title,year:String(movie.year),type:movie.type,genre:movie.genre,genres:movie.genres || [movie.genre],rating:String(movie.rating),image:movie.image || null,description:movie.description,source_url:movie.source_url || null};
}
async function readWatchlist(id) {
    const result = await profileRequest('/profiles/' + encodeURIComponent(id) + '/watchlist');
    const imports = read('void.database-imported.v1', {});
    if (!imports[id]) {
        for (const titleId of legacyLists[id] || []) {
            const movie = titleIndex.get(titleId);
            if (movie && !result.titles.some(item => item.id === movie.id)) {
                await profileRequest('/profiles/' + encodeURIComponent(id) + '/watchlist/' + encodeURIComponent(movie.id), 'PUT', titlePayload(movie));
                result.titles.push(movie);
            }
        }
        imports[id] = true;
        write('void.database-imported.v1', imports);
    }
    result.titles.forEach(movie => titleIndex.set(movie.id, movie));
    savedLists[id] = result.titles.map(movie => movie.id);
}
function syncWatchlist(id) {
    if (watchlistLoads.has(id)) return watchlistLoads.get(id);
    watchlistErrors.delete(id);
    const task = readWatchlist(id).then(() => {
        backupWatchlists();
        return true;
    }).catch(error => {
        watchlistErrors.set(id,error.message);
        return false;
    }).finally(() => {
        watchlistLoads.delete(id);
        if (activeProfile?.id === id) { updateSaveButtons(); render(); }
    });
    watchlistLoads.set(id,task);
    return task;
}
function backupWatchlists() {
    write('void.lists', savedLists);
    const allSaved = new Set(Object.values(savedLists).flat());
    write('void.saved-titles', [...allSaved].map(key => titleIndex.get(key)).filter(Boolean));
}
async function loadProfiles() {
    profileBusy = true;
    profilesReady = false;
    $('#profile-error').textContent = 'Loading your profiles…';
    $('#retry-profiles').hidden = true;
    renderProfiles();
    try {
        const result = await profileRequest('/profiles');
        profiles = result.profiles;
        activeProfile = null;
        profilesReady = true;
        write('void.profiles', profiles);
        $('#profile-error').textContent = '';
        if (activeProfile) { write('void.active',activeProfile.id); $('#profiles').close(); updateProfile(); }
    } catch (error) {
        activeProfile = null;
        $('#profile-error').textContent = error.message;
        $('#retry-profiles').hidden = false;
        if (!$('#profiles').open) $('#profiles').showModal();
    } finally {
        profileBusy = false;
        renderProfiles();
        render();
    }
}
async function selectProfile(id) {
    if (!profilesReady || profileBusy) return;
    const profile = profiles.find(item => item.id === id);
    if (!profile) return;
    profileTransition = {action:'enter',id};
    $('#entry-pin').value = '';
    $('#entry-pin-label').hidden = false;
    $('#profile-confirm-title').textContent = 'Watch as ' + profile.name + '?';
    $('#profile-confirm-description').textContent = 'Enter your PIN to unlock this profile.';
    $('#confirm-profile-transition').textContent = 'Enter profile';
    $('#profile-transition-error').textContent = '';
    $('#profile-confirmation').showModal();
}
async function enterProfile(id) {
    const profile = profiles.find(item => item.id === id);
    if (!profile || !profilesReady || profileBusy) return false;
    profileBusy = true;
    renderProfiles();
    try {
        activeProfile = profile;
        write('void.active', id);
        syncWatchlist(id);
        $('#profiles').close();
        $('#profile-error').textContent = '';
        updateProfile();
        render();
        if (typeof startPartyInvitationPolling === 'function') startPartyInvitationPolling();
        if (typeof enterPendingWatchParty === 'function') enterPendingWatchParty();
        return true;
    } catch (error) { $('#profile-error').textContent = error.message; return false; }
    finally { profileBusy = false; renderProfiles(); }
}
function requestProfileLeave() {
    if (!profilesReady || profileBusy) return;
    if (!activeProfile) { showProfileChooser(); return; }
    profileTransition = {action:'leave',id:activeProfile.id};
    $('#profile-confirm-title').textContent = 'Leave ' + activeProfile.name + '’s profile?';
    $('#profile-confirm-description').textContent = 'Return to Who’s watching. Your watchlist and viewing history will stay saved.';
    $('#entry-pin-label').hidden = true;
    $('#confirm-profile-transition').textContent = 'Leave profile';
    $('#profile-transition-error').textContent = '';
    $('#profile-confirmation').showModal();
}
function showProfileChooser() {
    resetProfileForm();
    renderProfiles();
    if (!$('#profiles').open) $('#profiles').showModal();
}
async function confirmProfileTransition() {
    if (!profileTransition || profileBusy) return;
    const transition = profileTransition;
    $('#confirm-profile-transition').disabled = true;
    $('#cancel-profile-transition').disabled = true;
    try {
        if (transition.action === 'enter' || transition.action === 'edit') {
            const login = await profileRequest('/profiles/' + encodeURIComponent(transition.id) + '/login', 'POST', {pin:$('#entry-pin').value});
            $('#entry-pin').value = '';
            if (login.must_change_pin) {
                $('#profile-confirmation').close();
                openPinSettings(transition.id, transition);
                return;
            }
            if (transition.action === 'edit') {
                editProfile(profiles.find(profile => profile.id === transition.id));
                $('#profile-confirmation').close();
                profileTransition = null;
                return;
            }
            if (!await enterProfile(transition.id)) {
                $('#profile-transition-error').textContent = $('#profile-error').textContent || 'Could not open this profile. Please try again.';
                return;
            }
        } else {
            if (typeof leaveWatchParty === 'function') await leaveWatchParty(true);
            if (typeof closePlayer === 'function') closePlayer();
            await profileRequest('/profile-logout', 'POST');
            activeProfile = null;
            if (typeof stopPartyInvitationPolling === 'function') stopPartyInvitationPolling();
            write('void.active',null);
            $('#profile-name').textContent = 'Choose profile';
            $('#profile-avatar').textContent = '?';
            updateSaveButtons();
            render();
            showProfileChooser();
        }
        profileTransition = null;
        $('#profile-confirmation').close();
    } catch (error) {
        $('#profile-transition-error').textContent = error.message;
    } finally {
        $('#confirm-profile-transition').disabled = false;
        $('#cancel-profile-transition').disabled = false;
    }
}
function editProfile(profile) {
        if (!activeProfile || activeProfile.id !== profile?.id) return;
        const id = profile.id;
        editingProfileId = id;
        $('#new-name').value = profile.name;
        $('#avatar-choice').value = avatarClass(profile);
        $('#profile-form-label').textContent = 'Edit ' + profile.name;
        $('#save-profile').textContent = 'Save changes';
        $('#cancel-edit').hidden = false;
        $('#profile-form-error').textContent = '';
        $('#profile-editor').showModal();
        $('#new-name').focus();
        $('#new-pin-fields').hidden = true;
        $('#new-pin').required = false;
        $('#confirm-new-pin').required = false;
}

function resetProfileForm() {
    $('#profile-editor').close();
    $('#profile-form-error').textContent = '';
    $('#new-pin-fields').hidden = false;
    $('#new-pin').required = true;
    $('#confirm-new-pin').required = true;
    $('#new-pin').value = '';
    $('#confirm-new-pin').value = '';
    editingProfileId = null;
    $('#new-name').value = '';
    $('#avatar-choice').value = 'violet';
    $('#profile-form-label').textContent = 'Create your profile';
    $('#save-profile').textContent = '＋ Add profile';
    $('#cancel-edit').hidden = false;
}

function renderProfiles() {
    $('#profile-cards').innerHTML = profiles.map(profile => `<button class="profile-card" data-profile="${escapeHtml(profile.id)}" ${!profilesReady || profileBusy ? 'disabled' : ''}><span class="avatar avatar-${avatarClass(profile)}">${escapeHtml(avatarFor(profile))}</span>${escapeHtml(profile.name)}</button>`).join('');
    $('#profile-cards').querySelectorAll('button').forEach(button => button.addEventListener('click', () => selectProfile(button.dataset.profile)));
    $('#profile-cards').setAttribute('aria-busy',String(profileBusy));
    $('#save-profile').disabled = !profilesReady || profileBusy;
    $('#open-add-profile').disabled = !profilesReady || profileBusy;
    $('#cancel-edit').disabled = profileBusy;
    $('#profiles-title').textContent = 'Who’s watching?';
    $('#profile-subtitle').textContent = 'Pick a profile. Find your escape.';
}
function updateProfile() {
    if (!activeProfile) return;
    if (typeof loadWatchHistory === 'function') loadWatchHistory(activeProfile.id);
    $('#profile-name').textContent = activeProfile.name;
    $('#profile-avatar').textContent = avatarFor(activeProfile);
    $('#profile-avatar').className = 'avatar-' + avatarClass(activeProfile);
    updateSaveButtons();
}
function updateSaveButtons() {
    document.querySelectorAll('[data-save-title]').forEach(button => {
        const id = button.dataset.saveTitle;
        const isSaved = saved().includes(id);
        button.classList.toggle('is-saved', isSaved);
        if (button.classList.contains('hero-save')) {
            button.innerHTML = isSaved ? '✓ Added to my list' : `${cinemaIcon('plus')} My list`;
        }
        button.setAttribute('aria-pressed', String(isSaved));
        button.setAttribute('aria-label', (isSaved ? 'Remove from my list: ' : 'Add to my list: ') + (titleIndex.get(id)?.title || 'Title'));
        button.disabled = !profilesReady || watchlistLoads.has(activeProfile?.id) || watchlistErrors.has(activeProfile?.id) || pendingSaves.has(activeProfile?.id + ':' + id);
    });
    if ($('#detail-save') && currentMovie) {
        $('#detail-save').disabled = !profilesReady || watchlistLoads.has(activeProfile?.id) || watchlistErrors.has(activeProfile?.id) || pendingSaves.has(activeProfile?.id + ':' + currentMovie.id);
        $('#detail-save').textContent = saved().includes(currentMovie.id) ? '✓ Remove from my list' : '＋ Add to my list';
    }
}
async function toggleSave(id) {
    if (!activeProfile || !profilesReady) { if (!$('#profiles').open) $('#profiles').showModal(); return; }
    const profileId = activeProfile.id;
    if (watchlistLoads.has(profileId)) await watchlistLoads.get(profileId);
    if (activeProfile?.id !== profileId) return;
    if (watchlistErrors.has(profileId)) { notify('Your saved list couldn’t sync. Open My list and try again before making changes.'); return; }
    const key = profileId + ':' + id;
    if (pendingSaves.has(key)) return;
    const exists = saved().includes(id);
    pendingSaves.add(key);
    updateSaveButtons();
    try {
        await profileRequest('/profiles/' + encodeURIComponent(profileId) + '/watchlist/' + encodeURIComponent(id), exists ? 'DELETE' : 'PUT', exists ? undefined : titlePayload(titleIndex.get(id)));
        const items = savedLists[profileId] || [];
        savedLists[profileId] = exists ? items.filter(item => item !== id) : [...new Set([...items, id])];
        backupWatchlists();
        render();
        notify(exists ? 'Removed from your list' : 'Added to your list', () => {
            if (activeProfile?.id === profileId && saved().includes(id) !== exists) toggleSave(id);
        });
    } catch (error) { notify(error.message); }
    finally { pendingSaves.delete(key); updateSaveButtons(); }
}
function poster(movie, lazy = false) {
    const safeImage = typeof movie.image === 'string' && /^https:\/\/(image\.tmdb\.org|lumiere-a\.akamaihd\.net|upload\.wikimedia\.org|static\.tvmaze\.com)\//.test(movie.image);
    const responsiveImage = safeImage && movie.image.startsWith('https://image.tmdb.org/t/p/w500/')
        ? `srcset="${escapeHtml(movie.image.replace('/w500/','/w185/'))} 185w, ${escapeHtml(movie.image.replace('/w500/','/w342/'))} 342w, ${escapeHtml(movie.image)} 500w" sizes="${lazy ? '(max-width:700px) 40vw, 200px' : '180px'}"`
        : '';
    return safeImage
        ? `<img src="${escapeHtml(movie.image)}" ${responsiveImage} decoding="async" alt="${escapeHtml(movie.title)} poster" ${lazy ? 'loading="lazy"' : ''}>`
        : '<span class="poster-placeholder" role="img" aria-label="No poster available">V<span>THE VOID</span></span>';
}
function cinemaIcon(name) {
    const paths = {play:'<path d="M8 5v14l11-7-11-7Z"/>',bookmark:'<path d="M6 4h12v17l-6-4-6 4V4Z"/>',plus:'<path d="M12 5v14M5 12h14"/>'};
    return `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="${name === 'play' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${paths[name] || ''}</svg>`;
}
function bindSaveButtons(container) {
    container.querySelectorAll('[data-save-title]').forEach(button => button.addEventListener('click', () => toggleSave(button.dataset.saveTitle)));
    updateSaveButtons();
}
function card(movie) {
    const rating = movie.rating && movie.rating !== '—' ? `<span class="rating">★ ${escapeHtml(movie.rating)}</span>` : '';
    return `<article class="card-shell"><button class="movie-card" data-movie="${escapeHtml(movie.id)}" aria-label="View ${escapeHtml(movie.title)}"><div class="poster">${poster(movie,true)}${rating}</div><h4>${escapeHtml(movie.title)}</h4><p>${escapeHtml(movie.year)} · ${escapeHtml(movie.genre)}</p></button><button class="poster-save${saved().includes(movie.id) ? ' is-saved' : ''}" data-save-title="${escapeHtml(movie.id)}" aria-label="Add to my list: ${escapeHtml(movie.title)}" aria-pressed="${saved().includes(movie.id)}">${cinemaIcon('bookmark')}</button></article>`;
}
function row(title, items, horizontal = false, explore = null) {
    if (!items.length) return '';
    const posters = `<div class="poster-grid${horizontal ? ' genre-posters' : ''}">${items.map(card).join('')}</div>`;
    const carousel = horizontal ? `<div class="genre-carousel">${posters}<button class="row-arrow row-arrow-left" data-row-direction="-1" aria-label="Previous ${escapeHtml(title)}" disabled>‹</button><button class="row-arrow row-arrow-right" data-row-direction="1" aria-label="Next ${escapeHtml(title)}" disabled>›</button></div>` : posters;
    const more = explore ? `<button class="genre-explore" data-explore-type="${escapeHtml(explore.type)}" data-explore-genre="${escapeHtml(explore.genre)}" data-explore-collection="${escapeHtml(explore.collection || 'popular')}">Explore more →<span class="sr-only"> ${escapeHtml(title)}</span></button>` : '';
    return `<section class="${horizontal ? 'genre-section' : ''}"><div class="row-heading"><h3><span>▍</span>${escapeHtml(title)}</h3><div class="row-summary"><small>${items.length} ${items.length === 1 ? 'title' : 'titles'} to explore</small>${more}</div></div>${carousel}</section>`;
}
function discoverPlan() {
    const filters = [...document.querySelectorAll('[data-genre]')].filter(button => button.dataset.genre !== 'All');
    if (page === 'Discover' && filters.length) {
        return [
            {type:'Movies',genre:'All',collection:'recent',title:'New movie releases'},
            {type:'Series',genre:'All',collection:'recent',title:'New series releases'},
            ...['Horror','Romance'].filter(label => filters.some(button => button.dataset.genre === label))
                .map(label => ({type:'Movies',genre:label})),
        ];
    }
    return ['Movies','Series'].filter(type => page === 'Discover' || page === type).flatMap(type => filters.filter(button => (button.dataset.types || '').includes(type)
        && !(type === 'Series' && ['Sci-Fi','Fantasy','Action','Adventure'].includes(button.dataset.genre)))
        .map(button => ({type,genre:button.dataset.genre})));
}
async function fetchDiscoverRows(plan, signal, onProgress = () => {}) {
    const rows = plan.map(descriptor => ({...descriptor,items:cachedDiscoverRow(descriptor)?.data.results || [],pending:true,failed:false}));
    onProgress(rows);
    let next = 0;
    async function worker() {
        while (next < plan.length && !signal.aborted) {
            const index = next++;
            const descriptor = plan[index];
            const key = descriptor.type + ':' + descriptor.genre + (descriptor.collection === 'recent' ? ':recent' : '');
            try {
                let cached = cachedDiscoverRow(descriptor);
                let data;
                if (cached?.expires > Date.now() && Array.isArray(cached.data?.results)) {
                    data = cached.data;
                } else {
                    if (index >= 2 && typeof IntersectionObserver !== 'undefined') await waitForCatalogRow(index,signal);
                    if (signal.aborted) return;
                    const params = new URLSearchParams({type:descriptor.type === 'Movies' ? 'movie' : 'tv',genre:descriptor.genre,page:'1'});
                    if (descriptor.collection) params.set('collection',descriptor.collection);
                    const response = await fetch('/catalog?' + params, {headers:{Accept:'application/json'},signal});
                    if (!response.ok) throw new Error('Genre unavailable');
                    data = await response.json();
                    if (data.source !== 'tmdb' || !Array.isArray(data.results)) throw new Error('Invalid genre response');
                    cached = {expires:Date.now() + 300000,data};
                    discoverCache.set(key,cached);
                    if (typeof sessionStorage !== 'undefined') {
                        try { sessionStorage.setItem('void.genre.' + key,JSON.stringify(cached)); } catch {}
                    }
                }
                rows[index] = {...descriptor,items:data.results,failed:false};
            } catch (error) {
                if (signal.aborted) throw error;
                rows[index] = {...descriptor,items:rows[index].items,failed:true};
            }
            if (!signal.aborted) onProgress(rows);
        }
    }
    await Promise.all(Array.from({length:Math.min(4,plan.length)},worker));
    if (signal.aborted) throw new Error('Discovery cancelled');
    const unavailable = rows.filter(item => item.failed).map(item => item.type + ':' + item.genre);
    return {source:unavailable.length === rows.length && !rows.some(item => item.items.length) ? 'unavailable' : 'tmdb',
        results:[...new Map(rows.flatMap(item => item.items).map(movie => [movie.id,movie])).values()],
        rows,page:1,has_more:false,unavailable};
}
async function openGenreGallery(type, label, collection = 'popular') {
    page = type;
    genre = label;
    catalogCollection = collection;
    query = '';
    $('#search').value = '';
    document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active',button.dataset.page === page));
    await loadCatalog(false,true);
    if (page === type && genre === label && !query) {
        $('#browse').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
}
function renderDiscoverRows() {
    return discoverRows.map((item, index) => {
        const title = item.title || item.genre + (item.type === 'Movies' ? ' movies' : ' series');
        if (item.items.length) return `<div${item.pending ? ` data-pending-row="${index}"` : ''}>` + row(title,page === 'Discover' ? item.items.slice(0,8) : item.items,true,item) + '</div>';
        if (item.pending) return `<section class="genre-section" data-pending-row="${index}"><div class="row-heading"><h3>${escapeHtml(title)}</h3></div><div class="poster-grid genre-posters" role="status" aria-label="Loading titles">${'<div class="poster" aria-hidden="true"></div>'.repeat(6)}</div></section>`;
        if (!item.failed) return '';
        return `<section class="genre-section"><div class="row-heading"><h3><span>▍</span>${escapeHtml(title)}</h3><button class="genre-explore" data-explore-type="${escapeHtml(item.type)}" data-explore-genre="${escapeHtml(item.genre)}" data-explore-collection="${escapeHtml(item.collection || 'popular')}">Try this genre →</button></div><p class="history-empty">This genre is temporarily unavailable.</p></section>`;
    }).join('');
}
function updateRowArrows(carousel) {
    const track = carousel.querySelector('.genre-posters');
    carousel.querySelector('[data-row-direction="-1"]').disabled = track.scrollLeft <= 2;
    carousel.querySelector('[data-row-direction="1"]').disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
}
function initializeRowArrows() {
    $('#catalog').querySelectorAll('.genre-carousel').forEach(carousel => {
        const track = carousel.querySelector('.genre-posters');
        carousel.querySelectorAll('[data-row-direction]').forEach(button => button.addEventListener('click', () => {
            track.scrollBy({left: Number(button.dataset.rowDirection) * track.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        }));
        track.addEventListener('scroll', () => updateRowArrows(carousel), {passive:true});
        updateRowArrows(carousel);
    });
}
window.addEventListener('resize', () => $('#catalog').querySelectorAll('.genre-carousel').forEach(updateRowArrows));
function genreRows(items) {
    const priority = ['Horror','Romance','Sci-Fi','Fantasy','Sci-Fi & Fantasy','Action','Adventure','Action & Adventure','Comedy','Animation','Drama','Thriller','Crime','Mystery','Family','Documentary'];
    const rows = [];
    for (const type of ['Movies','Series']) {
        const groups = new Map();
        for (const movie of items.filter(item => item.type === type)) {
            let labels = movie.genres?.length ? movie.genres : movie.genre && !['Movie','Series'].includes(movie.genre) ? [movie.genre] : ['Other'];
            if (genre !== 'All') {
                const selected = type === 'Series' && ['Sci-Fi','Fantasy'].includes(genre) ? 'Sci-Fi & Fantasy'
                    : type === 'Series' && ['Action','Adventure'].includes(genre) ? 'Action & Adventure' : genre;
                labels = labels.filter(label => label === selected);
            }
            for (const label of new Set(labels)) {
                if (!groups.has(label)) groups.set(label,[]);
                groups.get(label).push(movie);
            }
        }
        const rank = label => priority.includes(label) ? priority.indexOf(label) : priority.length;
        [...groups.keys()].sort((a,b) => rank(a) - rank(b) || a.localeCompare(b)).forEach(label => {
            rows.push(row(label + (type === 'Movies' ? ' movies' : ' series'), groups.get(label), !catalogGallery));
        });
    }
    return rows.join('');
}
function updateGenreFilters() {
    let reset = false;
    document.querySelectorAll('[data-genre]').forEach(button => {
        button.hidden = page === 'Discover' ? !['All','Anime'].includes(button.dataset.genre)
            : (page === 'Movies' || page === 'Series') && !(button.dataset.types || '').includes(page);
        if (button.hidden && button.dataset.genre === genre) reset = true;
    });
    if (reset) genre = 'All';
    document.querySelectorAll('[data-genre]').forEach(button => {
        button.classList.toggle('active',button.dataset.genre === genre);
        button.setAttribute('aria-pressed',String(button.dataset.genre === genre));
    });
}
function handleImageErrors(container) {
    container.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
        image.outerHTML = '<span class="poster-placeholder" role="img" aria-label="Poster unavailable">V<span>THE VOID</span></span>';
    }, {once:true}));
}
function render() {
    if (typeof renderWatchHistory === 'function') renderWatchHistory();
    const local = page === 'My list' || catalogMode !== 'tmdb';
    let filtered = page === 'My list' ? saved().map(id => titleIndex.get(id)).filter(Boolean) : catalog;
    if (local) {
        filtered = filtered.filter(movie => (genre === 'All' || (movie.genres || [movie.genre]).includes(genre)
            || (movie.type === 'Series' && ['Sci-Fi','Fantasy'].includes(genre) && movie.genres?.includes('Sci-Fi & Fantasy'))
            || (movie.type === 'Series' && ['Action','Adventure'].includes(genre) && movie.genres?.includes('Action & Adventure')))
            && movie.title.toLowerCase().includes(query.toLowerCase())
            && (page === 'Discover' || page === 'My list' || movie.type === page));
    }
    $('.hero').hidden = page !== 'Discover' || !!query;
    if (typeof refreshReleaseRotation === 'function') refreshReleaseRotation();
    $('#browse').style.paddingTop = page !== 'Discover' || query ? '120px' : '0';
    $('.discovery-heading').hidden = page === 'Discover' && !query;
    $('.catalog-status').hidden = page === 'Discover' && genre === 'All' && !query && !requestFailed && !unavailableSources.length;
    $('#section-title').textContent = query ? `Results for “${query}”` : page === 'My list' ? 'Your next movie night.' : page === 'Discover' ? 'Find your kind of story.' : `Explore ${page.toLowerCase()}.`;
    const rowPositions = [...$('#catalog').querySelectorAll('.genre-posters')].map(track => track.scrollLeft);
    $('#catalog').innerHTML = page !== 'My list' && genre === 'All' && !query && discoverRows ? renderDiscoverRows() : filtered.length
        ? (page !== 'My list' && !query
            ? catalogCollection === 'recent' ? row(page === 'Movies' ? 'New movie releases' : 'New series releases',filtered) : genreRows(filtered)
            : row(page === 'My list' ? 'Saved for later' : 'The collection',filtered))
        : `<div class="empty">${page === 'My list' && watchlistLoads.has(activeProfile?.id) ? 'Loading your saved titles…' : loading ? 'Finding your next story…' : page === 'My list' ? watchlistErrors.has(activeProfile?.id) ? 'Your saved list couldn’t sync. Please try again.' : 'No saved titles match. Explore the collection or clear your filters.' : hasMore ? 'No matches on this page. Explore more titles below or try another filter.' : requestFailed || unavailableSources.length ? 'Search is incomplete because the catalog could not be reached. Please try again.' : 'No titles match. Try another search or genre.'}</div>`;
    observeCatalogRows();
    $('#catalog').setAttribute('aria-busy', String(loading && !catalog.length));
    $('#catalog').querySelectorAll('[data-movie]').forEach(button => button.addEventListener('click', () => showDetails(button.dataset.movie)));
    bindSaveButtons($('#catalog'));
    $('#catalog').querySelectorAll('[data-explore-genre]').forEach(button => button.addEventListener('click', () => openGenreGallery(button.dataset.exploreType,button.dataset.exploreGenre,button.dataset.exploreCollection)));
    $('#catalog').querySelectorAll('.genre-posters').forEach((track,index) => { track.scrollLeft = rowPositions[index] || 0; });
    initializeRowArrows();
    handleImageErrors($('#catalog'));
    $('#load-more').hidden = page === 'My list' || !hasMore;
    $('#load-more').disabled = loading;
    $('#load-more').textContent = loading ? 'Loading…' : 'Explore more titles ↓';
    $('#catalog-retry').hidden = page === 'My list' ? !watchlistErrors.has(activeProfile?.id) : !requestFailed && !unavailableSources.length;
    $('#catalog-status').textContent = page === 'My list' ? watchlistLoads.has(activeProfile?.id) ? 'Syncing your saved list…' : watchlistErrors.has(activeProfile?.id) ? 'Your saved list couldn’t sync. Please try again.' : 'Saved to your profile. Ready for your next movie night.'
        : loading ? (catalog.length ? 'Your collection is ready. More genres load as you browse.' : 'Finding more stories…')
        : requestFailed ? (catalogMode === 'tmdb' ? 'Couldn’t load more titles. Your current collection is still here.' : 'TMDB is temporarily unavailable. Please try again.')
        : catalogMode === 'tmdb' ? (unavailableSources.length ? 'Part of the catalog is unavailable. Your available titles are shown below.' : 'Movies and series from TMDB · Explore the collection')
        : 'Movies and series from TMDB';
    $('#catalog-source').textContent = 'Catalog by TMDB' + ' · Player by CineSrc';
}
async function loadCatalog(append = false, gallery = false) {
    catalogGallery = append || gallery;
    discoverRows = null;
    updateGenreFilters();
    const version = ++requestVersion;
    requestController?.abort();
    catalogObserver?.disconnect();
    clearTimeout(searchTimer);
    loading = false;
    if (page === 'My list') { render(); return; }
    requestController = new AbortController();
    const requestedPage = append ? catalogPage + 1 : 1;
    loading = true;
    requestFailed = false;
    if (!append && catalogMode === 'tmdb') { catalog = []; hasMore = false; }
    const params = new URLSearchParams({type: page === 'Movies' ? 'movie' : page === 'Series' ? 'tv' : 'all', genre, q:query, page:String(requestedPage),collection:catalogCollection});
    try {
        const plan = page !== 'My list' && genre === 'All' && !query && !append && !gallery && catalogCollection === 'popular' ? discoverPlan() : [];
        let data;
        if (plan.length) {
            data = await fetchDiscoverRows(plan,requestController.signal, rows => {
                if (version !== requestVersion) return;
                discoverRows = rows.slice();
                catalog = [...new Map(rows.flatMap(item => item.items).map(movie => [movie.id,movie])).values()];
                catalog.forEach(movie => titleIndex.set(movie.id,movie));
                catalogMode = 'tmdb';
                unavailableSources = rows.filter(item => item.failed).map(item => item.type + ':' + item.genre);
                render();
            });
        } else {
            const key = params.toString();
            const cached = params.get('q') ? searchCache.get(key) : null;
            if (cached?.expires > Date.now()) {
                data = cached.data;
            } else {
                render();
                const response = await fetch('/catalog?' + params, {headers:{Accept:'application/json'},signal:requestController.signal});
                if (!response.ok) throw new Error('Catalog unavailable');
                data = await response.json();
                if (params.get('q') && data.source === 'tmdb' && Array.isArray(data.results) && !data.unavailable?.length) {
                    if (searchCache.size >= 40) searchCache.delete(searchCache.keys().next().value);
                    searchCache.set(key,{expires:Date.now() + 300000,data});
                }
            }
        }
        if (version !== requestVersion) return;
        if (data.source !== 'tmdb' || !Array.isArray(data.results)) throw new Error('Invalid response');
        catalogMode = 'tmdb';
        discoverRows = data.rows || null;
        unavailableSources = data.unavailable || [];
        data.results.forEach(movie => titleIndex.set(movie.id,movie));
        catalog = [...new Map([...(append ? catalog : []), ...data.results].map(movie => [movie.id,movie])).values()];
        catalogPage = data.page;
        hasMore = data.has_more;
    } catch (error) {
        if (version !== requestVersion || error.name === 'AbortError') return;
        requestFailed = true;
        if (!append) { catalogMode = 'unavailable'; catalog = []; hasMore = false; }
    } finally {
        if (version === requestVersion) { loading = false; render(); }
    }
}
function sourceCredit(movie) {
    const url = movie.source_url;
    if (typeof url !== 'string' || !/^https:\/\/(en\.wikipedia\.org\/wiki\/|www\.tvmaze\.com\/shows\/|www\.themoviedb\.org\/(movie|tv)\/)[^\s]+$/.test(url)) return '';
    const label = url.startsWith('https://en.wikipedia.org/') ? 'Wikipedia · adapted synopsis' : url.startsWith('https://www.themoviedb.org/') ? 'TMDB · title information' : 'TVmaze · adapted metadata';
    return `<p class="playback-note"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a></p>`;
}
function showDetails(id) {
    currentMovie = titleIndex.get(id);
    if (!currentMovie) return;
    const movie = currentMovie;
    const backdrop = typeof movie.backdrop === 'string' && /^https:\/\/image\.tmdb\.org\//.test(movie.backdrop) ? movie.backdrop : null;
    $('#detail-content').innerHTML = `<div class="detail-band">${backdrop ? `<img src="${escapeHtml(backdrop)}" alt="">` : poster(movie)}</div><div class="detail-layout"><div class="detail-poster">${poster(movie)}</div><div class="detail-info"><h2 id="detail-title">${escapeHtml(movie.title)}</h2><div class="metadata">${movie.rating && movie.rating !== '—' ? `<b>★ ${escapeHtml(movie.rating)}</b>` : ''}<span>${escapeHtml(movie.release_date || movie.year)}</span><span>${movie.type === 'Series' ? 'Series' : 'Movie'}</span></div><div class="detail-genres">${(movie.genres || [movie.genre]).map(genre => `<span>${escapeHtml(genre)}</span>`).join('')}</div><p class="detail-overview">${escapeHtml(movie.description)}</p><div class="detail-actions"><button class="primary" id="detail-watch">${cinemaIcon('play')} Watch now</button><button class="secondary" id="detail-save"></button></div></div></div><div class="detail-footer">${sourceCredit(movie)}<p class="playback-note">Playback provided by CineSrc — availability and ads are controlled by the provider.</p></div>`;
    $('#detail-save').addEventListener('click', () => toggleSave(id));
    $('#detail-watch').addEventListener('click', () => openPlayer(id));
    handleImageErrors($('#detail-content'));
    updateSaveButtons();
    $('#details').showModal();
}
$('#add-profile').addEventListener('submit', async event => {
    event.preventDefault();
    const name = $('#new-name').value.trim();
    if (!name || !profilesReady || profileBusy) return;
    const id = editingProfileId || crypto.randomUUID();
    profileBusy = true;
    $('#profile-form-error').textContent = '';
    renderProfiles();
    try {
        const result = await profileRequest('/profiles/' + encodeURIComponent(id), 'PUT', {name,avatar:$('#avatar-choice').value,...(editingProfileId ? {} : {pin:$('#new-pin').value,pin_confirmation:$('#confirm-new-pin').value})});
        const index = profiles.findIndex(profile => profile.id === id);
        if (index >= 0) profiles[index] = result.profile;
        else profiles.push(result.profile);
        if (activeProfile?.id === id) { activeProfile = result.profile; updateProfile(); }
        write('void.profiles',profiles);
        resetProfileForm();
        $('#profile-error').textContent = 'Profile saved.';
    } catch (error) { $('#profile-form-error').textContent = error.message; }
    finally { profileBusy = false; renderProfiles(); }
});
$('#open-add-profile').addEventListener('click', () => {
    if (!profilesReady || profileBusy) return;
    resetProfileForm();
    $('#profile-editor').showModal();
    $('#new-name').focus();
});
$('#profile-editor').addEventListener('cancel', event => { event.preventDefault(); if (!profileBusy) resetProfileForm(); });
$('#cancel-edit').addEventListener('click', () => { if (!profileBusy) resetProfileForm(); });
$('#retry-profiles').addEventListener('click', loadProfiles);
$('#profiles').addEventListener('cancel', event => { if (!activeProfile) event.preventDefault(); });
$('#confirm-profile-transition').addEventListener('click', confirmProfileTransition);
$('#cancel-profile-transition').addEventListener('click', () => { if (!profileBusy) { profileTransition = null; $('#profile-confirmation').close(); } });
$('#profile-confirmation').addEventListener('cancel', event => { if (profileBusy) event.preventDefault(); else profileTransition = null; });
$('.close').addEventListener('click', () => $('#details').close());
$('#details').addEventListener('click', event => {
    if (event.target !== $('#details')) return;
    const rect = $('#details').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#details').close();
});
document.querySelectorAll('a.brand[href="/"]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!activeProfile) return;
    $('[data-page="Discover"]').click();
    window.scrollTo({top:0,behavior:'instant'});
}));

document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    if (page === button.dataset.page && genre === 'All' && !query && !catalogGallery) return;
    page = button.dataset.page;
    catalogCollection = 'popular';
    if (page === 'Discover') {
        genre = 'All';
        query = '';
        $('#search').value = '';
    }
    document.querySelectorAll('[data-page]').forEach(item => {
        item.classList.toggle('active',item === button);
        item.setAttribute('aria-current',item === button ? 'page' : 'false');
    });
    loadCatalog();
}));
document.querySelectorAll('[data-genre]').forEach(button => button.addEventListener('click', () => {
    genre = button.dataset.genre;
    catalogCollection = 'popular';
    document.querySelectorAll('[data-genre]').forEach(item => {
        item.classList.toggle('active',item === button);
        item.setAttribute('aria-pressed',String(item === button));
    });
    loadCatalog();
}));
$('#search').addEventListener('input', event => {
    query = event.target.value.trim();
    catalogCollection = 'popular';
    clearTimeout(searchTimer);
    requestVersion++;
    requestController?.abort();
    loading = false;
    if (page === 'My list') { render(); return; }
    catalog = [];
    hasMore = false;
    render();
    searchTimer = setTimeout(() => loadCatalog(), 250);
});
$('#load-more').addEventListener('click', () => loadCatalog(true));
$('#catalog-retry').addEventListener('click', () => {
    if (page === 'My list' && activeProfile) { syncWatchlist(activeProfile.id); updateSaveButtons(); render(); return; }
    loadCatalog(!unavailableSources.length && catalogMode === 'tmdb' && catalogPage > 0);
});
renderProfiles();
updateProfile();
render();
loadCatalog();
$('#profiles').showModal();
loadProfiles();
