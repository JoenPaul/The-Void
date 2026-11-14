let releaseMovies = [], releaseIndex = 0, releaseTimer, releasePaused = false, releaseHovered = false, releaseFocused = false, releasesLoading = false;
const releaseMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function canRotateReleases() {
    return releaseMovies.length > 1 && !releasePaused && !releaseHovered && !releaseFocused && !releaseMotion.matches
        && !document.hidden && !$('.hero').hidden && !['#profiles','#details','#player'].some(selector => $(selector).open);
}
function refreshReleaseRotation() {
    clearTimeout(releaseTimer);
    if (canRotateReleases()) releaseTimer = setTimeout(() => { if (canRotateReleases()) changeRelease(1); }, 3000);
}
function showRelease(index) {
    if (!releaseMovies.length) return;
    releaseIndex = ((index % releaseMovies.length) + releaseMovies.length) % releaseMovies.length;
    $('#release-track').style.transform = `translateX(-${releaseIndex * 100}%)`;
    $('#release-track').querySelectorAll('.release-slide').forEach((slide, position) => {
        slide.inert = position !== releaseIndex;
        slide.setAttribute('aria-hidden', String(position !== releaseIndex));
    });
    $('#release-dots').querySelectorAll('button').forEach((button, position) => button.setAttribute('aria-current', String(position === releaseIndex)));
    $('#release-count').textContent = `${String(releaseIndex + 1).padStart(2,'0')} / ${String(releaseMovies.length).padStart(2,'0')}`;
    refreshReleaseRotation();
}
function changeRelease(direction) { showRelease(releaseIndex + direction); }
function renderReleases() {
    $('#release-track').innerHTML = releaseMovies.map((movie, index) => {
        const image = typeof movie.backdrop === 'string' && /^https:\/\/image\.tmdb\.org\//.test(movie.backdrop) ? movie.backdrop : null;
        return `<article class="release-slide" aria-roledescription="slide" aria-label="${index + 1} of ${releaseMovies.length}: ${escapeHtml(movie.title)}" ${index ? 'inert aria-hidden="true"' : ''}>
            ${image ? `<img class="release-art" src="${escapeHtml(image)}" alt="" ${index ? 'loading="lazy"' : 'fetchpriority="high"'}>` : ''}<div class="hero-shade"></div>
            <div class="hero-content"><p class="eyebrow"><span></span> NEWLY RELEASED</p><h1>${escapeHtml(movie.title)}</h1><div class="metadata">${movie.rating !== '—' ? `<b>★ ${escapeHtml(movie.rating)}</b>` : ''}<span>${escapeHtml(movie.release_date || movie.year)}</span><span>Movie</span></div><div class="hero-genres">${(movie.genres || []).map(genre => `<span>${escapeHtml(genre)}</span>`).join('')}</div><p class="hero-description">${escapeHtml(movie.description)}</p><div class="hero-buttons"><button class="primary" data-release-watch="${escapeHtml(movie.id)}">${cinemaIcon('play')} Watch now</button><button class="secondary hero-save" data-save-title="${escapeHtml(movie.id)}">${cinemaIcon('plus')} My list</button><button class="ghost" data-release="${escapeHtml(movie.id)}">Details</button></div></div></article>`;
    }).join('');
    $('#release-track').querySelectorAll('[data-release]').forEach(button => button.addEventListener('click', () => showDetails(button.dataset.release)));
    $('#release-track').querySelectorAll('[data-release-watch]').forEach(button => button.addEventListener('click', () => openPlayer(button.dataset.releaseWatch)));
    bindSaveButtons($('#release-track'));
    $('#release-track').querySelectorAll('img').forEach(image => image.addEventListener('error', () => image.remove(), {once:true}));
    $('#release-dots').innerHTML = releaseMovies.map((movie, index) => `<button aria-label="Show release ${index + 1}: ${escapeHtml(movie.title)}" data-slide="${index}" aria-current="false"></button>`).join('');
    $('#release-dots').querySelectorAll('button').forEach(button => button.addEventListener('click', () => showRelease(Number(button.dataset.slide))));
    ['#release-previous','#release-next','#release-pause'].forEach(selector => $(selector).disabled = releaseMovies.length < 2);
    showRelease(0);
}
async function loadReleases() {
    if (releasesLoading) return;
    releasesLoading = true;
    $('#retry-releases').hidden = true;
    $('#release-status').textContent = 'Finding the latest releases…';
    try {
        const response = await fetch('/releases', {headers:{Accept:'application/json'}});
        if (!response.ok) throw new Error('Releases unavailable');
        const data = await response.json();
        if (data.source !== 'tmdb' || !Array.isArray(data.results)) throw new Error('Invalid releases');
        releaseMovies = data.results.slice(0,6);
        releaseMovies.forEach(movie => titleIndex.set(movie.id,movie));
        if (!releaseMovies.length) {
            $('#release-status').textContent = 'No recent releases are available right now.';
            $('#retry-releases').hidden = false;
            return;
        }
        renderReleases();
    } catch {
        $('#release-status').textContent = 'New releases couldn’t load. Please try again.';
        $('#retry-releases').hidden = false;
    } finally { releasesLoading = false; }
}
$('#release-next').addEventListener('click', () => changeRelease(1));
$('#release-previous').addEventListener('click', () => changeRelease(-1));
$('#release-pause').addEventListener('click', () => {
    releasePaused = !releasePaused;
    $('#release-pause').textContent = releasePaused ? 'Play' : 'Pause';
    $('#release-pause').setAttribute('aria-label', releasePaused ? 'Play carousel' : 'Pause carousel');
    refreshReleaseRotation();
});
$('#retry-releases').addEventListener('click', loadReleases);
$('.hero').addEventListener('mouseenter', () => { releaseHovered = true; refreshReleaseRotation(); });
$('.hero').addEventListener('mouseleave', () => { releaseHovered = false; refreshReleaseRotation(); });
$('.hero').addEventListener('focusin', () => { releaseFocused = true; refreshReleaseRotation(); });
$('.hero').addEventListener('focusout', event => { releaseFocused = $('.hero').contains(event.relatedTarget); refreshReleaseRotation(); });
document.addEventListener('visibilitychange', refreshReleaseRotation);
releaseMotion.addEventListener('change', refreshReleaseRotation);
['#profiles','#details','#player'].forEach(selector => $(selector).addEventListener('close', refreshReleaseRotation));
loadReleases();
