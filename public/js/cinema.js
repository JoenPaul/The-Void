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
function notify(message) {
    $('#toast').textContent = message;
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
const featuredMovie = movies[0];
let profiles = read('void.profiles', [{id:'joen',name:'Joen'},{id:'guest',name:'Guest'}]);
if (!Array.isArray(profiles) || !profiles.length || profiles.some(profile => !profile || typeof profile.id !== 'string' || typeof profile.name !== 'string')) {
    profiles = [{id:'guest',name:'Guest'}];
}
let activeProfile = profiles.find(profile => profile.id === read('void.active', null));
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
let catalog = movies, catalogMode = 'pending', catalogPage = 0, hasMore = false, loading = false;
let requestVersion = 0, requestController, searchTimer, requestFailed = false, unavailableSources = [], movieSource = 'wikipedia';
const legacyProfiles = profiles.map(profile => ({...profile}));
const legacyLists = {...savedLists};
const legacyActiveId = activeProfile?.id;
let profilesReady = false, profileBusy = false, editingProfiles = false, editingProfileId = null;
const pendingSaves = new Set();
const avatarSymbols = {moon:'☾',star:'✦',orbit:'◈'};
const avatarFor = profile => avatarSymbols[profile.avatar] || profile.name.slice(0,1).toUpperCase();
const avatarClass = profile => ['violet','moon','star','orbit'].includes(profile.avatar) ? profile.avatar : 'violet';

async function profileRequest(path, method = 'GET', body) {
    const response = await fetch(path, {
        method, credentials:'same-origin',
        headers: {Accept:'application/json', 'Content-Type':'application/json', 'X-CSRF-TOKEN':$('meta[name="csrf-token"]').content},
        ...(body ? {body:JSON.stringify(body)} : {}),
    });
    if (!response.ok) {
        if (response.status === 419) throw new Error('Your session expired. Refresh the page and try again.');
        const error = await response.json().catch(() => ({}));
        throw new Error(response.status === 422 ? Object.values(error.errors || {}).flat()[0] || 'Please check the profile details.' : 'Could not reach your saved profiles. Please try again.');
    }
    return response.json();
}
function titlePayload(movie) {
    return {title:movie.title,year:String(movie.year),type:movie.type,genre:movie.genre,genres:movie.genres || [movie.genre],rating:String(movie.rating),image:movie.image || null,description:movie.description,source_url:movie.source_url || null};
}
async function readWatchlist(id) {
    const result = await profileRequest('/profiles/' + encodeURIComponent(id) + '/watchlist');
    result.titles.forEach(movie => titleIndex.set(movie.id, movie));
    savedLists[id] = result.titles.map(movie => movie.id);
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
        const remote = result.profiles;
        const imports = read('void.database-imported.v1', {});
        const shouldImport = !remote.length || read('void.profiles', null) || Object.keys(legacyLists).length;
        const mapping = {};
        if (shouldImport) {
            for (const legacy of legacyProfiles) {
                let match = remote.find(profile => profile.id === legacy.id || profile.name.toLowerCase() === legacy.name.toLowerCase());
                if (!match) {
                    const created = await profileRequest('/profiles/' + encodeURIComponent(legacy.id), 'PUT', {name:legacy.name,avatar:avatarClass(legacy)});
                    match = created.profile;
                    remote.push(match);
                }
                mapping[legacy.id] = match.id;
                if (!imports[legacy.id]) {
                    const existing = await profileRequest('/profiles/' + encodeURIComponent(match.id) + '/watchlist');
                    const existingIds = new Set(existing.titles.map(movie => movie.id));
                    for (const titleId of legacyLists[legacy.id] || []) {
                        const movie = titleIndex.get(titleId);
                        if (movie && !existingIds.has(movie.id)) {
                            await profileRequest('/profiles/' + encodeURIComponent(match.id) + '/watchlist/' + encodeURIComponent(movie.id), 'PUT', titlePayload(movie));
                        }
                    }
                    imports[legacy.id] = true;
                    write('void.database-imported.v1', imports);
                }
            }
        }
        profiles = remote;
        activeProfile = profiles.find(profile => profile.id === (mapping[legacyActiveId] || legacyActiveId));
        if (activeProfile) await readWatchlist(activeProfile.id);
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
    if (editingProfiles) {
        editingProfileId = id;
        $('#new-name').value = profile.name;
        $('#avatar-choice').value = avatarClass(profile);
        $('#profile-form-label').textContent = 'Edit ' + profile.name;
        $('#save-profile').textContent = 'Save changes';
        $('#cancel-edit').hidden = false;
        $('#new-name').focus();
        return;
    }
    profileBusy = true;
    renderProfiles();
    try {
        await readWatchlist(id);
        activeProfile = profile;
        write('void.active', id);
        backupWatchlists();
        $('#profiles').close();
        $('#profile-error').textContent = '';
        updateProfile();
        render();
    } catch (error) { $('#profile-error').textContent = error.message; }
    finally { profileBusy = false; renderProfiles(); }
}
function resetProfileForm() {
    editingProfileId = null;
    $('#new-name').value = '';
    $('#avatar-choice').value = 'violet';
    $('#profile-form-label').textContent = 'Make it yours';
    $('#save-profile').textContent = '＋ Add profile';
    $('#cancel-edit').hidden = true;
}

function renderProfiles() {
    $('#profile-cards').innerHTML = profiles.map(profile => `<button class="profile-card" data-profile="${escapeHtml(profile.id)}" ${!profilesReady || profileBusy ? 'disabled' : ''}><span class="avatar avatar-${avatarClass(profile)}">${escapeHtml(avatarFor(profile))}</span>${escapeHtml(profile.name)}${editingProfiles ? '<span class="edit-hint">Edit profile</span>' : ''}</button>`).join('');
    $('#profile-cards').querySelectorAll('button').forEach(button => button.addEventListener('click', () => selectProfile(button.dataset.profile)));
    $('#profile-cards').setAttribute('aria-busy',String(profileBusy));
    $('#save-profile').disabled = !profilesReady || profileBusy;
    $('#manage-profiles').disabled = !profilesReady || profileBusy;
    $('#profiles-title').textContent = editingProfiles ? 'Make it your own.' : 'Who’s watching?';
    $('#profile-subtitle').textContent = editingProfiles ? 'Choose a profile to edit its name and avatar.' : 'Pick a profile. Find your escape.';
    $('#manage-profiles').textContent = editingProfiles ? 'Done editing' : 'Edit profiles';
}
function updateProfile() {
    if (!activeProfile) return;
    $('#profile-name').textContent = activeProfile.name;
    $('#profile-avatar').textContent = avatarFor(activeProfile);
    $('#profile-avatar').className = 'avatar-' + avatarClass(activeProfile);
    updateSaveButtons();
}
function updateSaveButtons() {
    const busy = pendingSaves.has(activeProfile?.id + ':' + featuredMovie.id);
    $('#hero-save').disabled = !profilesReady || busy;
    $('#hero-save').textContent = saved().includes(featuredMovie.id) ? '✓ In my list' : '＋ My list';
    if ($('#detail-save') && currentMovie) {
        $('#detail-save').disabled = !profilesReady || pendingSaves.has(activeProfile?.id + ':' + currentMovie.id);
        $('#detail-save').textContent = saved().includes(currentMovie.id) ? '✓ Remove from my list' : '＋ Add to my list';
    }
}
async function toggleSave(id) {
    if (!activeProfile || !profilesReady) { if (!$('#profiles').open) $('#profiles').showModal(); return; }
    const profileId = activeProfile.id;
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
        notify(exists ? 'Removed from your list' : 'Saved to your profile');
    } catch (error) { notify(error.message); }
    finally { pendingSaves.delete(key); updateSaveButtons(); }
}
function poster(movie, lazy = false) {
    const safeImage = typeof movie.image === 'string' && /^https:\/\/(image\.tmdb\.org|lumiere-a\.akamaihd\.net|upload\.wikimedia\.org|static\.tvmaze\.com)\//.test(movie.image);
    return safeImage
        ? `<img src="${escapeHtml(movie.image)}" alt="${escapeHtml(movie.title)} poster" ${lazy ? 'loading="lazy"' : ''}>`
        : '<span class="poster-placeholder" role="img" aria-label="No poster available">V<span>THE VOID</span></span>';
}
function card(movie) {
    return `<button class="movie-card" data-movie="${escapeHtml(movie.id)}" aria-label="View ${escapeHtml(movie.title)}"><div class="poster">${poster(movie,true)}<span class="rating">★ ${escapeHtml(movie.rating)}</span></div><h4>${escapeHtml(movie.title)}</h4><p>${escapeHtml(movie.year)} · ${movie.type === 'Movies' ? 'Movie' : 'Series'}<span>${escapeHtml(movie.genre)}</span></p></button>`;
}
function row(title, items) {
    if (!items.length) return '';
    return `<section><div class="row-heading"><h3><span>▍</span>${title}</h3><small>${items.length} ${items.length === 1 ? 'title' : 'titles'} to explore</small></div><div class="poster-grid">${items.map(card).join('')}</div></section>`;
}
function handleImageErrors(container) {
    container.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
        image.outerHTML = '<span class="poster-placeholder" role="img" aria-label="Poster unavailable">V<span>THE VOID</span></span>';
    }, {once:true}));
}
function render() {
    const local = page === 'My list' || catalogMode !== 'open';
    let filtered = page === 'My list' ? saved().map(id => titleIndex.get(id)).filter(Boolean) : catalog;
    if (local) {
        filtered = filtered.filter(movie => (genre === 'All' || (movie.genres || [movie.genre]).includes(genre))
            && movie.title.toLowerCase().includes(query.toLowerCase())
            && (page === 'Discover' || page === 'My list' || movie.type === page));
    }
    $('.hero').hidden = page !== 'Discover' || !!query;
    $('#browse').style.paddingTop = page !== 'Discover' || query ? '120px' : '0';
    $('#section-title').textContent = query ? `Results for “${query}”` : page === 'My list' ? 'Your next movie night.' : page === 'Discover' ? 'Find your kind of story.' : `Explore ${page.toLowerCase()}.`;
    $('#catalog').innerHTML = filtered.length
        ? (page === 'Discover' && !query
            ? row('Movies worth staying in for',filtered.filter(movie => movie.type === 'Movies')) + row('One more episode',filtered.filter(movie => movie.type === 'Series'))
            : row(page === 'My list' ? 'Saved for later' : 'The collection',filtered))
        : `<div class="empty">${loading ? 'Finding your next story…' : page === 'My list' ? 'No saved titles match. Explore the collection or clear your filters.' : hasMore ? 'No matches on this page. Explore more titles below or try another filter.' : 'No titles match. Try another search or genre.'}</div>`;
    $('#catalog').setAttribute('aria-busy', String(loading));
    $('#catalog').querySelectorAll('[data-movie]').forEach(button => button.addEventListener('click', () => showDetails(button.dataset.movie)));
    handleImageErrors($('#catalog'));
    $('#load-more').hidden = page === 'My list' || !hasMore;
    $('#load-more').disabled = loading;
    $('#load-more').textContent = loading ? 'Loading…' : 'Explore more titles ↓';
    $('#catalog-retry').hidden = (!requestFailed && !unavailableSources.length) || page === 'My list';
    $('#catalog-status').textContent = page === 'My list' ? 'Saved to your profile. Ready for your next movie night.'
        : loading ? 'Finding more stories…'
        : requestFailed ? (catalogMode === 'open' ? 'Couldn’t load more titles. Your current collection is still here.' : 'The full catalog is unavailable. Showing the preview collection.')
        : catalogMode === 'open' ? (unavailableSources.length ? 'Part of the catalog is unavailable. Your available titles are shown below.' : (movieSource === 'tmdb' ? 'TMDB movies' : 'Wikipedia movies') + ' · TVmaze series · Explore the collection')
        : 'Preview collection · More stories coming soon';
    $('#catalog-source').textContent = (catalogMode === 'open' ? (movieSource === 'tmdb' ? 'TMDB + TVmaze' : 'Wikipedia + TVmaze') : 'Preview collection') + ' · Player by CineSrc';
}
async function loadCatalog(append = false) {
    const version = ++requestVersion;
    requestController?.abort();
    clearTimeout(searchTimer);
    loading = false;
    if (page === 'My list' || (catalogMode === 'demo' && !requestFailed)) { render(); return; }
    requestController = new AbortController();
    const requestedPage = append ? catalogPage + 1 : 1;
    loading = true;
    requestFailed = false;
    if (!append && catalogMode === 'open') { catalog = []; hasMore = false; }
    render();
    const params = new URLSearchParams({type: page === 'Movies' ? 'movie' : page === 'Series' ? 'tv' : 'all', genre, q:query, page:String(requestedPage)});
    try {
        const response = await fetch('/catalog?' + params, {headers:{Accept:'application/json'},signal:requestController.signal});
        if (!response.ok) throw new Error('Catalog unavailable');
        const data = await response.json();
        if (version !== requestVersion) return;
        if (data.source === 'demo') {
            catalogMode = 'demo';
            catalog = movies;
            hasMore = false;
            catalogPage = 0;
        } else {
            if (data.source !== 'open' || !Array.isArray(data.results)) throw new Error('Invalid response');
            catalogMode = 'open';
            unavailableSources = data.unavailable || [];
            movieSource = data.movie_source || 'wikipedia';
            data.results.forEach(movie => titleIndex.set(movie.id,movie));
            catalog = [...new Map([...(append ? catalog : []), ...data.results].map(movie => [movie.id,movie])).values()];
            catalogPage = data.page;
            hasMore = data.has_more;
        }
    } catch (error) {
        if (version !== requestVersion || error.name === 'AbortError') return;
        requestFailed = true;
        if (!append) { catalogMode = 'unavailable'; catalog = movies; hasMore = false; }
    } finally {
        if (version === requestVersion) { loading = false; render(); }
    }
}
function sourceCredit(movie) {
    const url = movie.source_url;
    if (typeof url !== 'string' || !/^https:\/\/(en\.wikipedia\.org\/wiki\/|www\.tvmaze\.com\/shows\/|www\.themoviedb\.org\/movie\/)[^\s]+$/.test(url)) return '';
    const label = url.startsWith('https://en.wikipedia.org/') ? 'Wikipedia · adapted synopsis' : url.startsWith('https://www.themoviedb.org/') ? 'TMDB · movie information' : 'TVmaze · adapted metadata';
    return `<p class="playback-note"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a></p>`;
}
function showDetails(id) {
    currentMovie = titleIndex.get(id);
    if (!currentMovie) return;
    const movie = currentMovie;
    $('#detail-content').innerHTML = `<div class="detail-layout"><div class="detail-poster">${poster(movie)}</div><div><p class="eyebrow">THE VOID COLLECTION</p><h2 id="detail-title">${escapeHtml(movie.title)}</h2><div class="metadata"><b>★ ${escapeHtml(movie.rating)}</b><span>${escapeHtml(movie.year)}</span><span>${escapeHtml(movie.genre)}</span></div><p>${escapeHtml(movie.description)}</p>${sourceCredit(movie)}<div class="detail-actions"><button class="primary" id="detail-watch">▶ Watch now</button><button class="secondary" id="detail-save"></button></div><p class="playback-note">Playback provided by CineSrc.</p></div></div>`;
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
    $('#profile-error').textContent = '';
    renderProfiles();
    try {
        const result = await profileRequest('/profiles/' + encodeURIComponent(id), 'PUT', {name,avatar:$('#avatar-choice').value});
        const index = profiles.findIndex(profile => profile.id === id);
        if (index >= 0) profiles[index] = result.profile;
        else profiles.push(result.profile);
        if (activeProfile?.id === id) { activeProfile = result.profile; updateProfile(); }
        write('void.profiles',profiles);
        resetProfileForm();
        $('#profile-error').textContent = 'Profile saved.';
    } catch (error) { $('#profile-error').textContent = error.message; }
    finally { profileBusy = false; renderProfiles(); }
});
$('#manage-profiles').addEventListener('click', () => { editingProfiles = !editingProfiles; resetProfileForm(); $('#profile-error').textContent = ''; renderProfiles(); });
$('#cancel-edit').addEventListener('click', resetProfileForm);
$('#retry-profiles').addEventListener('click', loadProfiles);
$('#profiles').addEventListener('cancel', event => { if (!activeProfile) event.preventDefault(); });
$('#switch-profile').addEventListener('click', () => { editingProfiles = false; resetProfileForm(); renderProfiles(); $('#profiles').showModal(); });
$('.close').addEventListener('click', () => $('#details').close());
$('#details').addEventListener('click', event => {
    if (event.target !== $('#details')) return;
    const rect = $('#details').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#details').close();
});
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    page = button.dataset.page;
    document.querySelectorAll('[data-page]').forEach(item => item.classList.toggle('active',item === button));
    loadCatalog();
}));
document.querySelectorAll('[data-genre]').forEach(button => button.addEventListener('click', () => {
    genre = button.dataset.genre;
    document.querySelectorAll('[data-genre]').forEach(item => {
        item.classList.toggle('active',item === button);
        item.setAttribute('aria-pressed',String(item === button));
    });
    loadCatalog();
}));
$('#search').addEventListener('input', event => {
    query = event.target.value.trim();
    clearTimeout(searchTimer);
    requestVersion++;
    requestController?.abort();
    loading = false;
    if (catalogMode === 'demo' || page === 'My list') { render(); return; }
    catalog = [];
    hasMore = false;
    render();
    searchTimer = setTimeout(() => loadCatalog(), 350);
});
$('#load-more').addEventListener('click', () => loadCatalog(true));
$('#catalog-retry').addEventListener('click', () => loadCatalog(!unavailableSources.length && catalogMode === 'open' && catalogPage > 0));
$('#hero-details').addEventListener('click', () => showDetails(featuredMovie.id));
$('#hero-save').addEventListener('click', () => toggleSave(featuredMovie.id));
renderProfiles();
updateProfile();
render();
loadCatalog();
$('#profiles').showModal();
loadProfiles();
