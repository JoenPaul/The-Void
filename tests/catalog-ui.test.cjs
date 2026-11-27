const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync('public/js/cinema.js', 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = results => ({ ok: true, json: async () => ({source: 'tmdb', results, page: 1, has_more: true}) });
const title = (id, name) => ({id, title: name, type: 'Movies', year: '2024', genre: 'Drama', genres: ['Drama'], rating: '8', image: null, description: 'A story.'});

function setup(fetch, storage = new Map(), database = {profiles:new Map([['joen',{id:'joen',name:'Joen'}],['guest',{id:'guest',name:'Guest'}]]), lists:new Map(), failWrites:false}, withReleases = false, genreFilters = []) {
    database.history ||= new Map();
    const elements = new Map();
    const timers = new Map();
    let timerId = 0;
    const motion = {matches:false,addEventListener() {}};
    function element(selector) {
        if (!elements.has(selector)) elements.set(selector, {
            innerHTML: '', textContent: '', value: '', style: {}, hidden: false, listeners: {},
            content: 'test-csrf', contentWindow:{}, setAttribute() {}, querySelectorAll() { return []; }, focus() {}, scrollIntoView() {}, contains() { return false; },
            addEventListener(event, handler) { this.listeners[event] = handler; },
            showModal() { this.open = true; }, close() { this.open = false; },
        });
        return elements.get(selector);
    }
    const context = vm.createContext({
        document: {querySelector: element, querySelectorAll: selector => selector === '[data-genre]' ? genreFilters : [],addEventListener() {}},
        localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
        fetch: async (url, options = {}) => {
            if (url === '/profile-logout') return {ok:true,json:async () => ({logged_out:true})};
            if (!url.startsWith('/profiles')) return fetch(url, options);
            const parts = url.split('/').map(decodeURIComponent);
            const method = options.method || 'GET';
            const body = options.body ? JSON.parse(options.body) : null;
            const result = data => ({ok:true,json:async () => data});
            if (database.failWrites && method !== 'GET') return {ok:false,status:503,json:async () => ({})};
            if (parts.length === 2) return result({profiles:[...database.profiles.values()].filter(profile => !profile.archived).map(profile => ({...profile})),archived_ids:[...database.profiles.values()].filter(profile => profile.archived).map(profile => profile.id)});
            if (parts[3] === 'login') return body.pin === '4567'
                ? result({must_change_pin:!!database.mustChangePin, ...(options.headers['X-Viewer-Tab'] === '1' ? {viewer_token:`viewer-${parts[2]}`} : {})})
                : {ok:false,status:422,json:async () => ({errors:{pin:['Incorrect PIN. Please try again.']}})};
            if (parts[3] === 'pin') return result({changed:true});
            if (parts.length === 3) {
                if (method === 'DELETE') {
                    database.profiles.get(parts[2]).archived = true;
                    return result({archived:true});
                }
                const profile = {id:parts[2],...body}; database.profiles.set(parts[2],profile);
                return result({profile});
            }
            if (parts[3] === 'history') {
                if (!database.history.has(parts[2])) database.history.set(parts[2], new Map());
                const history = database.history.get(parts[2]);
                if (method === 'GET') return result({entries:[...history.values()].reverse()});
                const entry = {id:parts[4],...body,watched_at:new Date().toISOString()};
                history.delete(parts[4]); history.set(parts[4],entry);
                return result({entry});
            }
            if (!database.lists.has(parts[2])) database.lists.set(parts[2],new Map());
            const list = database.lists.get(parts[2]);
            if (method === 'GET') return result({titles:[...list.values()]});
            if (method === 'PUT') list.set(parts[4],{id:parts[4],...body});
            if (method === 'DELETE') list.delete(parts[4]);
            return result({saved:method === 'PUT'});
        }, AbortController, URLSearchParams, URL, window:{addEventListener() {},matchMedia:() => motion}, crypto: {randomUUID: () => 'new-profile'},
        setTimeout: (callback, delay) => { timers.set(++timerId,{callback,delay}); return timerId; }, clearTimeout: id => timers.delete(id),
    });
    vm.runInContext(source, context);
    vm.runInContext(readFileSync('public/js/profile-security.js','utf8'), context);
    vm.runInContext(readFileSync('public/js/history.js','utf8'), context);
    vm.runInContext(readFileSync('public/js/playback.js','utf8'), context);
    if (withReleases) vm.runInContext(readFileSync('public/js/releases.js','utf8'), context);
    return {run: code => vm.runInContext(code, context), element, storage, database,timers,motion};
}

test('a failed catalog request shows a retryable error without preview titles', async () => {
    let calls = 0;
    const app = setup(async () => { calls++; return calls === 1 ? {ok:false} : response([title('movie:42','Recovered title')]); });
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog-status').textContent, /TMDB is temporarily unavailable/);
    assert.match(app.element('#catalog').innerHTML, /Search is incomplete/);
    assert.doesNotMatch(app.element('#catalog').innerHTML, /Interstellar|Dune/);
    await app.run('loadCatalog()');
    assert.match(app.element('#catalog').innerHTML, /Recovered title/);
});

test('a stale search response cannot overwrite the latest results', async () => {
    const pending = [];
    const app = setup(() => new Promise(resolve => pending.push(resolve)));
    const next = app.run("query = 'Latest'; loadCatalog();");
    pending[1](response([title('movie:2', 'Latest title')]));
    await next;
    pending[0](response([title('movie:1', 'Old result')]));
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog').innerHTML, /Latest title/);
    assert.doesNotMatch(app.element('#catalog').innerHTML, /Old result/);
});

test('saved live titles survive reloads and stay separate between profiles', async () => {
    const storage = new Map([['void.active', JSON.stringify('joen')], ['void.lists', JSON.stringify({joen:[1]})]]);
    const app = setup(async () => response([title('movie:42', 'Saved live title')]), storage);
    await settle();
    await signInRememberedProfile(app);
    await app.run("toggleSave('movie:42');");
    assert.deepEqual(JSON.parse(storage.get('void.lists')).joen, ['movie:693134', 'movie:42']);
    const reloaded = setup(async () => ({ok: true, json: async () => ({source:'tmdb',results:[]})}), storage, app.database);
    await settle();
    await signInRememberedProfile(reloaded);
    reloaded.run("page = 'My list'; render();");
    assert.match(reloaded.element('#catalog').innerHTML, /Saved live title/);
    assert.match(reloaded.element('#catalog').innerHTML, /Dune: Part Two/);
    reloaded.run("activeProfile = profiles.find(profile => profile.id === 'guest'); render();");
    assert.doesNotMatch(reloaded.element('#catalog').innerHTML, /Saved live title/);
});

test('database watchlists survive clearing browser storage', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("toggleSave('movie:42')");
    const cleanBrowser = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[]})}), new Map(), app.database);
    await settle();
    await signInRememberedProfile(cleanBrowser);
    await cleanBrowser.run("selectProfile('joen'); $('#entry-pin').value = '4567'; confirmProfileTransition()");
    await settle();
    cleanBrowser.run("page = 'My list'; render()");
    assert.match(cleanBrowser.element('#catalog').innerHTML, /A saved movie/);
});

test('failed saves do not change the list or claim success', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    app.database.failWrites = true;
    await app.run("toggleSave('movie:42')");
    assert.equal(app.run("saved().includes('movie:42')"),false);
    assert.match(app.element('#toast').textContent,/Could not reach/);
});

test('save feedback can undo a completed write without changing another profile', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("toggleSave('movie:42')");
    assert.equal(app.database.lists.get('joen').has('movie:42'), true);
    app.element('#toast-undo').listeners.click();
    await settle();
    assert.equal(app.database.lists.get('joen').has('movie:42'), false);
    await app.run("toggleSave('movie:42')");
    app.run("activeProfile = profiles.find(profile => profile.id === 'guest')");
    app.element('#toast-undo').listeners.click();
    await settle();
    assert.equal(app.database.lists.get('joen').has('movie:42'), true);
    assert.equal(app.run('saved().length'), 0);
});

test('poster save controls are separate buttons and omit missing ratings', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]));
    await settle();
    const markup = app.run('card({...titleIndex.get("movie:42"), rating:"—"})');
    assert.match(markup, /<\/button><button class="poster-save/);
    assert.doesNotMatch(markup, /class="rating"/);
    assert.match(markup, /data-save-title="movie:42"/);
});

test('legacy import runs once and does not resurrect removed titles', async () => {
    const storage = new Map([['void.active',JSON.stringify('joen')],['void.lists',JSON.stringify({joen:[1]})]]);
    const app = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[]})}),storage);
    await settle();
    await signInRememberedProfile(app);
    assert.equal(app.database.lists.get('joen').size,1);
    app.database.lists.get('joen').clear();
    const reloaded = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[]})}),storage,app.database);
    await settle();
    await signInRememberedProfile(reloaded);
    assert.equal(reloaded.database.lists.get('joen').size,0);
    assert.equal(reloaded.run('saved().length'),0);
});

test('pagination deduplicates titles and failures preserve the current collection', async () => {
    let count = 0;
    const app = setup(async () => {
        count++;
        if (count === 3) return {ok: false};
        return {ok:true, json:async () => ({source:'tmdb',results:count === 1 ? [title('movie:42','First')] : [title('movie:42','First'),title('movie:43','Second')],page:count,has_more:true})};
    });
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog').innerHTML, /genre-posters/);
    await app.run('loadCatalog(true)');
    assert.equal(app.run('catalog.length'), 2);
    assert.doesNotMatch(app.element('#catalog').innerHTML, /genre-posters|row-arrow/);
    assert.match(app.element('#catalog').innerHTML, /class="poster-grid"/);
    await app.run('loadCatalog(true)');
    assert.equal(app.run('catalog.length'), 2);
    assert.equal(app.element('#catalog-retry').hidden, false);
    assert.equal(app.element('#load-more').disabled, false);
    assert.doesNotMatch(app.element('#catalog').innerHTML, /genre-posters/);
    await app.run('loadCatalog()');
    assert.match(app.element('#catalog').innerHTML, /genre-posters/);
});

test('external titles are escaped and missing artwork has a placeholder', async () => {
    const app = setup(async () => response([title('movie:9', '<img src=x onerror=alert(1)>')]));
    await settle();
    await signInRememberedProfile(app);
    const html = app.element('#catalog').innerHTML;
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /No poster available/);
});

test('new catalog artwork and source credits survive a watchlist reload', async () => {
    const movie = {...title('wiki:aaaaaaaaaaaaaaaaaaaaaaaa', 'Wikipedia movie'), image:'https://upload.wikimedia.org/poster.jpg', source_url:'https://en.wikipedia.org/wiki/Example'};
    const storage = new Map([['void.active', JSON.stringify('joen')]]);
    const app = setup(async () => response([movie]), storage);
    await settle();
    await signInRememberedProfile(app);
    await app.run("toggleSave('wiki:aaaaaaaaaaaaaaaaaaaaaaaa')");
    const reloaded = setup(async () => response([]), storage, app.database);
    await settle();
    await signInRememberedProfile(reloaded);
    reloaded.run("showDetails('wiki:aaaaaaaaaaaaaaaaaaaaaaaa')");
    assert.match(reloaded.element('#detail-content').innerHTML, /upload.wikimedia.org/);
    assert.match(reloaded.element('#detail-content').innerHTML, /Wikipedia · adapted synopsis/);
    assert.equal(reloaded.run("sourceCredit({source_url:'javascript:alert(1)'})"), '');
});

test('a partial catalog failure keeps available titles and offers retry', async () => {
    const app = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[title('wiki:aaaaaaaaaaaaaaaaaaaaaaaa','Available movie')],page:1,has_more:false,unavailable:['tv']})}));
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog').innerHTML, /Available movie/);
    assert.match(app.element('#catalog-status').textContent, /Part of the catalog/);
    assert.equal(app.element('#catalog-retry').hidden, false);
});

test('movie player uses a fixed sandboxed origin and resumes only trusted progress for the selected profile', async () => {
    const storage = new Map([['void.active', JSON.stringify('joen')]]);
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','Watch this')]), storage);
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42')");
    const html = app.element('#player-frame').innerHTML;
    assert.match(html, /https:\/\/cinesrc.st\/embed\/movie\/42/);
    assert.match(html, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
    assert.doesNotMatch(html, /allow-popups|test-csrf|joen/);
    app.run("handlePlayerMessage({origin:'https://evil.example',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:timeupdate',currentTime:120,duration:600}})");
    assert.equal(storage.has('void.playback.v1'),false);
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:{},data:{type:'cinesrc:timeupdate',currentTime:120,duration:600}})");
    assert.equal(storage.has('void.playback.v1'),false);
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:timeupdate',currentTime:120,duration:600}})");
    app.run('closePlayer()');
    await app.run("openPlayer('movie:42')");
    assert.match(app.element('#player-frame').innerHTML, /t=120/);
    app.run("closePlayer(); activeProfile = profiles.find(profile => profile.id === 'guest')");
    await app.run("openPlayer('movie:42')");
    assert.doesNotMatch(app.element('#player-frame').innerHTML, /[?&]t=120/);
});

test('closing the player cancels a late mapping response', async () => {
    let finish;
    const app = setup(async url => url.startsWith('/playback/') ? new Promise(resolve => { finish = resolve; }) : response([{...title('tv:42','Watch this'),type:'Series'}]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    const pending = app.run("openPlayer('tv:42')");
    app.run('closePlayer()');
    finish({ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})});
    await pending;
    assert.equal(app.element('#player-frame').innerHTML,'');
    assert.equal(app.element('#player').open,false);
});

test('an empty partial response does not claim a complete search had no matches', async () => {
    const app = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[],page:1,has_more:false,unavailable:['movie']})}));
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog').innerHTML, /Search is incomplete/);
    assert.equal(app.element('#catalog-retry').hidden, false);
});

test('new-release carousel advances horizontally after its delay and pauses for interaction and dialogs', async () => {
    const releases = [{...title('movie:81','First release'),backdrop:'https://image.tmdb.org/t/p/w1280/art.jpg',release_date:'2026-10-20'},title('movie:82','Second release')];
    const app = setup(async url => url === '/releases' ? response(releases) : response([]),new Map([['void.active',JSON.stringify('joen')]]),undefined,true);
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#release-track').innerHTML, /First release/);
    assert.doesNotMatch(app.element('#release-track').innerHTML, /Dune: Part Two/);
    assert.match(app.element('#release-track').innerHTML, /data-release-watch="movie:81"/);
    assert.match(app.element('#release-track').innerHTML, /data-save-title="movie:81"/);
    app.run('refreshReleaseRotation()');
    const timer = [...app.timers.values()].find(timer => timer.delay === 3000);
    assert.ok(timer);
    timer.callback();
    assert.equal(app.element('#release-track').style.transform,'translateX(-100%)');
    app.element('.hero').listeners.mouseenter();
    assert.equal([...app.timers.values()].some(timer => timer.delay === 3000),false);
    app.element('.hero').listeners.mouseleave();
    app.element('#release-pause').listeners.click();
    assert.equal(app.element('#release-pause').textContent,'Play');
    assert.equal([...app.timers.values()].some(timer => timer.delay === 3000),false);
    app.element('#release-pause').listeners.click();
    app.element('#player').open = true;
    app.run('refreshReleaseRotation()');
    assert.equal([...app.timers.values()].some(timer => timer.delay === 3000),false);
    app.element('#player').open = false;
    app.motion.matches = true;
    app.run('refreshReleaseRotation()');
    assert.equal([...app.timers.values()].some(timer => timer.delay === 3000),false);
    app.run('changeRelease(-1)');
    assert.equal(app.element('#release-track').style.transform,'translateX(-0%)');
});

test('failed release feeds show a retry option without pretending an old film is new', async () => {
    const app = setup(async url => url === '/releases' ? {ok:false} : response([]),new Map(),undefined,true);
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#release-status').textContent,/couldn’t load/);
    assert.equal(app.element('#retry-releases').hidden,false);
    assert.equal(app.run('releaseMovies.length'),0);
});

test('recent history starts after real playback and survives a new browser without mixing profiles', async () => {
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','Recently played')]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42')");
    assert.equal(app.database.history.get('joen').size,0);
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:pause',currentTime:120,duration:600}})");
    await settle();
    assert.equal(app.database.history.get('joen').size,0);
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:play'}})");
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:pause',currentTime:120,duration:600}})");
    await settle();
    assert.equal(app.database.history.get('joen').size,1);
    assert.match(app.element('#recent-content').innerHTML,/Recently played/);
    assert.match(app.element('#recent-content').innerHTML,/2 min watched/);
    const reloaded = setup(async () => response([]),new Map(),app.database);
    await settle();
    await signInRememberedProfile(reloaded);
    await reloaded.run("selectProfile('joen'); $('#entry-pin').value = '4567'; confirmProfileTransition()");
    await settle();
    assert.match(reloaded.element('#recent-content').innerHTML,/Recently played/);
    assert.equal(JSON.parse(reloaded.storage.get('void.playback.v1'))['joen:movie:42'].position,120);
    await reloaded.run("selectProfile('guest'); $('#entry-pin').value = '4567'; confirmProfileTransition()");
    await settle();
    assert.doesNotMatch(reloaded.element('#recent-content').innerHTML,/Recently played/);
});

test('history stays with the playback profile if the active profile changes during a save', async () => {
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','A movie')]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42')");
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:play'}})");
    app.run("activeProfile = profiles.find(profile => profile.id === 'guest'); handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:pause',currentTime:120,duration:600}})");
    await settle();
    assert.equal(app.database.history.get('joen').size,1);
    assert.equal(app.database.history.get('guest')?.size || 0,0);
    assert.doesNotMatch(app.element('#recent-content').innerHTML,/A movie/);
});

test('failed history saves preserve local progress and show an error without a false entry', async () => {
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','A movie')]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42')");
    app.database.failWrites = true;
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:play'}})");
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:pause',currentTime:120,duration:600}})");
    await settle();
    assert.equal(app.database.history.get('joen').size,0);
    assert.match(app.element('#recent-status').textContent,/Couldn’t save/);
    assert.equal(JSON.parse(app.storage.get('void.playback.v1'))['joen:movie:42'].position,120);
});

test('catalog groups movies and series into all their genres while search stays a single collection', async () => {
    const app = setup(async () => response([
        {...title('movie:42','A mixed movie'),genre:'Horror',genres:['Horror','Romance']},
        {...title('tv:42','A funny series'),type:'Series',genre:'Sci-Fi & Fantasy',genres:['Sci-Fi & Fantasy','Comedy']},
    ]));
    await settle();
    await signInRememberedProfile(app);
    const html = app.element('#catalog').innerHTML;
    assert.match(html,/Horror movies/);
    assert.match(html,/Romance movies/);
    assert.match(html,/Sci-Fi &amp; Fantasy series/);
    assert.match(html,/Comedy series/);
    assert.equal((html.match(/A mixed movie<\/h4>/g) || []).length,2);
    assert.match(html,/genre-posters/);
    app.run("query='mixed'; render()");
    assert.doesNotMatch(app.element('#catalog').innerHTML,/genre-posters/);
    assert.match(app.element('#catalog').innerHTML,/The collection/);
});

test('selected genres use the correct movie and combined TV headings', async () => {
    const app = setup(async () => response([{...title('tv:42','Fantasy series'),type:'Series',genres:['Sci-Fi & Fantasy','Drama']} ]));
    await settle();
    await signInRememberedProfile(app);
    app.run("genre='Fantasy'; render()");
    assert.match(app.element('#catalog').innerHTML,/Sci-Fi &amp; Fantasy series/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Drama series/);
});

test('genre row arrows move a page and disable at either end', async () => {
    const app = setup(async () => response([]));
    await settle();
    await signInRememberedProfile(app);
    app.run(`
        const previous = {dataset:{rowDirection:'-1'},addEventListener(event, callback) {this.click = callback;}};
        const next = {dataset:{rowDirection:'1'},addEventListener(event, callback) {this.click = callback;}};
        const track = {scrollLeft:0,clientWidth:600,scrollWidth:1800,addEventListener(event, callback) {this.onScroll = callback;},scrollBy(options) {this.lastScroll = options;this.scrollLeft += options.left;}};
        const carousel = {querySelector(selector) {return selector === '.genre-posters' ? track : selector.includes('-1') ? previous : next;},querySelectorAll() {return [previous,next];}};
        document.querySelector('#catalog').querySelectorAll = selector => selector === '.genre-carousel' ? [carousel] : [];
        initializeRowArrows();
    `);
    assert.equal(app.run('previous.disabled'), true);
    assert.equal(app.run('next.disabled'), false);
    app.run('next.click();track.onScroll();');
    assert.equal(app.run('track.lastScroll.left'), 600);
    assert.equal(app.run('track.lastScroll.behavior'), 'smooth');
    assert.equal(app.run('previous.disabled'), false);
    app.run('next.click();track.onScroll();');
    assert.equal(app.run('next.disabled'), true);
    app.motion.matches = true;
    app.run('previous.click();track.onScroll();');
    assert.equal(app.run('track.lastScroll.left'), -600);
    assert.equal(app.run('track.lastScroll.behavior'), 'instant');
    assert.equal(app.run('next.disabled'), false);
});

const genreFilter = (genre, types) => ({dataset:{genre,types},classList:{toggle() {}},setAttribute() {},addEventListener() {}});

test('the Anime filter is available on Discover and requests movies and series together', async () => {
    const filters = [genreFilter('All','Movies Series'), genreFilter('Anime','Movies Series'), genreFilter('History','Movies')];
    const requested = [];
    const app = setup(async url => {
        const params = new URL(url, 'https://void.test').searchParams;
        requested.push(params);
        return response(params.get('genre') === 'Anime' ? [
            {...title('movie:42','Anime Movie'), genres:['Animation','Anime']},
            {...title('tv:88','Anime Show'), type:'Series', genres:['Animation','Anime']},
        ] : []);
    }, new Map(), undefined, false, filters);
    await settle();
    assert.equal(filters[1].hidden, false);
    assert.equal(filters[2].hidden, false);

    await app.run("genre = 'Anime'; loadCatalog()");
    assert.equal(requested.at(-1).get('type'), 'all');
    assert.equal(requested.at(-1).get('genre'), 'Anime');
    assert.match(app.element('#catalog').innerHTML, /Anime Movie/);
    assert.match(app.element('#catalog').innerHTML, /Anime Show/);
});

test('Discover shows four short curated rows and opens a paginated genre gallery', async () => {
    const calls = [];
    const filters = [genreFilter('All','Movies Series'),genreFilter('Horror','Movies'),genreFilter('Romance','Movies'),genreFilter('Sci-Fi','Movies Series'),genreFilter('Sci-Fi & Fantasy','Series')];
    const app = setup(async url => {
        const params = new URL(url,'https://void.test').searchParams;
        calls.push(params);
        const label = params.get('genre');
        const media = params.get('type');
        return response(Array.from({length:20},(_,index) => ({...title(`${media}:${label}${index}`,`${label} title ${index}`),type:media === 'tv' ? 'Series' : 'Movies',genre:label,genres:[label]})));
    },new Map(),undefined,false,filters);
    await settle();
    await signInRememberedProfile(app);
    assert.equal(calls.length,4);
    assert.equal(calls.filter(params => params.get('type') === 'tv').length,1);
    assert.match(app.element('#catalog').innerHTML,/Romance movies/);
    assert.match(app.element('#catalog').innerHTML,/New movie releases/);
    assert.match(app.element('#catalog').innerHTML,/New series releases/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Sci-Fi movies|Sci-Fi &amp; Fantasy series/);
    assert.equal((app.element('#catalog').innerHTML.match(/8 titles to explore/g) || []).length,4);
    assert.equal(calls.filter(params => params.get('collection') === 'recent').length,2);
    assert.equal(filters.find(button => button.dataset.genre === 'Sci-Fi').hidden,false);
    assert.equal(app.element('#load-more').hidden,true);
    assert.match(app.element('#catalog').innerHTML,/data-explore-genre="Romance"/);
    await app.run("openGenreGallery('Movies','Romance')");
    assert.equal(calls.at(-1).get('genre'),'Romance');
    assert.equal(calls.at(-1).get('page'),'1');
    assert.doesNotMatch(app.element('#catalog').innerHTML,/genre-posters|row-arrow/);
    await app.run('loadCatalog(true)');
    assert.equal(calls.at(-1).get('genre'),'Romance');
    assert.equal(calls.at(-1).get('page'),'2');
    const before = calls.length;
    await app.run("page = 'Discover'; genre = 'All'; loadCatalog()");
    assert.equal(calls.length,before);
});

test('Discover preserves successful rows when another genre fails and retries only the failed feed', async () => {
    let failing = true;
    const calls = [];
    const app = setup(async url => {
        const params = new URL(url,'https://void.test').searchParams;
        calls.push(params.get('genre'));
        if (params.get('genre') === 'Romance' && failing) return {ok:false};
        return response([{...title('movie:' + params.get('genre'),params.get('genre') + ' film'),genre:params.get('genre')}]);
    },new Map(),undefined,false,[genreFilter('Horror','Movies'),genreFilter('Romance','Movies')]);
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog').innerHTML,/Horror film/);
    assert.match(app.element('#catalog').innerHTML,/This genre is temporarily unavailable/);
    assert.equal(app.element('#catalog-retry').hidden,false);
    failing = false;
    await app.run('loadCatalog()');
    assert.deepEqual(calls,['All','All','Horror','Romance','Romance']);
    assert.match(app.element('#catalog').innerHTML,/Romance film/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/temporarily unavailable/);
});

test('leaving Discover cancels its pending feeds without replacing a newer search', async () => {
    const pending = [];
    const filters = [genreFilter('Horror','Movies'),genreFilter('Romance','Movies'),genreFilter('Comedy','Movies')];
    const app = setup((url, options) => {
        const params = new URL(url,'https://void.test').searchParams;
        if (params.get('q')) return Promise.resolve(response([title('movie:99','Search winner')]));
        return new Promise(resolve => pending.push({resolve,signal:options.signal}));
    },new Map(),undefined,false,filters);
    assert.equal(pending.length,4);
    await app.run("query = 'Search winner'; loadCatalog()");
    assert.ok(pending.every(item => item.signal.aborted));
    pending.forEach(item => item.resolve(response([title('movie:1','Stale genre')])));
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog').innerHTML,/Search winner/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Stale genre/);
    assert.equal(pending.length,4);
});

test('entering and leaving profiles require confirmation and Cancel keeps the current profile', async () => {
    const app = setup(async () => response([]));
    await settle();
    await signInRememberedProfile(app);
    app.run("selectProfile('joen')");
    assert.equal(app.run('activeProfile'),null);
    assert.equal(app.element('#profile-confirmation').open,true);
    assert.equal(app.element('#profile-confirm-title').textContent,'Watch as Joen?');
    app.element('#cancel-profile-transition').listeners.click();
    assert.equal(app.run('activeProfile'),null);
    assert.equal(app.element('#profile-confirmation').open,false);
    await app.run("selectProfile('joen'); $('#entry-pin').value = '4567'; confirmProfileTransition()");
    assert.equal(app.run('activeProfile.id'),'joen');
    assert.equal(app.element('#profile-confirmation').open,false);
    app.element('#profile-signout').listeners.click();
    assert.equal(app.run('activeProfile.id'),'joen');
    assert.match(app.element('#profile-confirm-title').textContent,/Leave Joen/);
    app.element('#cancel-profile-transition').listeners.click();
    assert.equal(app.run('activeProfile.id'),'joen');
    app.element('#profile-signout').listeners.click();
    await app.run("$('#entry-pin').value = '4567'; confirmProfileTransition()");
    assert.equal(app.run('activeProfile'),null);
    assert.equal(JSON.parse(app.storage.get('void.active')),null);
    assert.equal(app.element('#profiles').open,true);
    assert.equal(app.element('#profile-confirmation').open,false);
    await app.run("selectProfile('guest'); $('#entry-pin').value = '4567'; confirmProfileTransition()");
    assert.equal(app.run('activeProfile.id'),'guest');
});

test('watchlist failures allow authenticated profile entry and offer retry without allowing unsafe saves', async () => {
    const app = setup(async () => response([]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    app.run("readWatchlist = async () => {throw new Error('Could not load this profile.');}; selectProfile('guest')");
    await app.run("$('#entry-pin').value = '4567'; confirmProfileTransition()");
    await settle();
    assert.equal(app.run('activeProfile.id'),'guest');
    assert.equal(app.element('#profile-confirmation').open,false);
    app.run("page = 'My list'; render()");
    assert.equal(app.element('#catalog-retry').hidden,false);
    await app.run("toggleSave('movie:693134')");
    assert.match(app.element('#toast').textContent,/couldn’t sync/);
    app.run("readWatchlist = async id => { savedLists[id] = ['movie:693134']; }");
    app.element('#catalog-retry').listeners.click();
    await settle();
    assert.equal(app.element('#catalog-retry').hidden,true);
    assert.match(app.element('#catalog').innerHTML,/Dune: Part Two/);
    assert.equal(app.element('#confirm-profile-transition').disabled,false);
});

test('Movies and Series each load independent full genre rows and reuse Discover feeds', async () => {
    const calls = [];
    const app = setup(async url => {
        const params = new URL(url,'https://void.test').searchParams;
        calls.push(params.get('type') + ':' + params.get('genre'));
        const label = params.get('genre');
        return response(Array.from({length:20},(_,index) => ({...title('movie:' + index,label + ' film ' + index),genres:[label],type:params.get('type') === 'tv' ? 'Series' : 'Movies'})));
    },new Map(),undefined,false,[genreFilter('Horror','Movies'),genreFilter('Romance','Movies'),genreFilter('Comedy','Movies Series')]);
    await settle();
    await signInRememberedProfile(app);
    const count = calls.length;
    await app.run("page = 'Movies'; loadCatalog()");
    assert.equal(calls.length,count + 1);
    assert.equal((app.element('#catalog').innerHTML.match(/20 titles to explore/g) || []).length,3);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Comedy series/);
    await app.run("page = 'Series'; loadCatalog()");
    assert.match(app.element('#catalog').innerHTML,/Comedy series/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Horror movies|Romance movies/);
    assert.equal(app.element('#load-more').hidden,true);
});

function seriesPlayer(fetchSeason) {
    return setup(async (url,options) => {
        if (url.startsWith('/playback/tv/')) return fetchSeason(url,options);
        if (url.startsWith('/playback/')) return {ok:true,json:async () => ({type:'tv',id:'42',seasons:[{number:1,name:'Season 1',episodes:3},{number:2,name:'Season 2',episodes:2}]})};
        return response([{...title('tv:42','Series to watch'),type:'Series'}]);
    },new Map([['void.active',JSON.stringify('joen')]]));
}
const seasonResponse = (season,episodes) => ({ok:true,json:async () => ({season,episodes})});

test('episode tiles resume playback and let CineSrc handle availability', async () => {
    const app = seriesPlayer(async () => seasonResponse(1,[
        {number:1,name:'<Pilot>',air_date:'2026-01-01',released:true},
        {number:2,name:'Soon',air_date:'2099-01-01',released:false},
        {number:3,name:'Unknown',air_date:null,released:false},
    ]));
    await settle();
    await signInRememberedProfile(app);
    app.storage.set('void.playback.v1',JSON.stringify({'joen:tv:42':{season:1,episode:1,position:45,duration:1000}}));
    await app.run("openPlayer('tv:42')");
    assert.equal(app.element('#episode-count').textContent,'3 listed');
    assert.match(app.element('#episode-tiles').innerHTML,/&lt;Pilot&gt;/);
    assert.match(app.element('#player-frame').innerHTML,/e=1.*t=45/);
    app.run('playSelectedEpisode(2)');
    assert.match(app.element('#player-frame').innerHTML,/e=2/);
    app.run('playSelectedEpisode(3)');
    assert.match(app.element('#player-frame').innerHTML,/e=3/);
    app.run('playSelectedEpisode(1)');
    assert.match(app.element('#player-frame').innerHTML,/<iframe/);
});

test('empty seasons never mount a player and failed episode feeds offer retry', async () => {
    let failed = false;
    const app = seriesPlayer(async () => failed ? {ok:false} : seasonResponse(1,[]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('tv:42')");
    assert.equal(app.element('#episode-count').textContent,'0 listed');
    assert.equal(app.element('#player-frame').innerHTML,'');
    assert.match(app.element('#player-status').textContent,/No episodes are listed/);
    failed = true;
    await app.run('loadSeasonEpisodes()');
    assert.equal(app.element('#retry-episodes').hidden,false);
    assert.equal(app.element('#player-frame').innerHTML,'');
});

test('late season responses cannot overwrite the newly selected season or reopen a closed player', async () => {
    const pending = [];
    const app = seriesPlayer((url,options) => new Promise(resolve => pending.push({url,resolve,signal:options.signal})));
    await settle();
    await signInRememberedProfile(app);
    const opening = app.run("openPlayer('tv:42')");
    await settle();
    app.element('#player-season').value = '2';
    const second = app.run('loadSeasonEpisodes()');
    pending[1].resolve(seasonResponse(2,[{number:1,name:'Second season',air_date:'2026-01-01',released:true}]));
    await second;
    pending[0].resolve(seasonResponse(1,[{number:1,name:'Stale season',released:true}]));
    await opening;
    assert.match(app.element('#episode-tiles').innerHTML,/Second season/);
    assert.doesNotMatch(app.element('#episode-tiles').innerHTML,/Stale season/);
    const retry = app.run('loadSeasonEpisodes()');
    app.run('closePlayer()');
    assert.equal(pending[2].signal.aborted,true);
    pending[2].resolve(seasonResponse(2,[{number:1,name:'Late',released:true}]));
    await retry;
    assert.equal(app.element('#player-frame').innerHTML,'');
    assert.equal(app.element('#player').open,false);
});

test('new-release Explore more keeps its collection and pagination in a full gallery', async () => {
    const calls = [];
    const app = setup(async url => {
        const params = new URL(url,'https://void.test').searchParams;
        calls.push(params);
        return response(Array.from({length:20},(_,index) => title('movie:' + index,'Release ' + index)));
    },new Map(),undefined,false,[genreFilter('Horror','Movies'),genreFilter('Romance','Movies')]);
    await settle();
    await signInRememberedProfile(app);
    await app.run("openGenreGallery('Series','All','recent')");
    assert.equal(calls.at(-1).get('collection'),'recent');
    assert.equal(calls.at(-1).get('type'),'tv');
    assert.match(app.element('#catalog').innerHTML,/New series releases/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/genre-carousel/);
    assert.equal((app.element('#catalog').innerHTML.match(/data-movie=/g) || []).length,20);
    await app.run('loadCatalog(true)');
    assert.equal(calls.at(-1).get('collection'),'recent');
    assert.equal(calls.at(-1).get('page'),'2');
});

test('genre rows appear before slower feeds finish and cached tabs restore synchronously', async () => {
    const pending = [];
    const app = setup(() => new Promise(resolve => pending.push(resolve)),new Map(),undefined,false,[genreFilter('Horror','Movies'),genreFilter('Romance','Movies')]);
    assert.match(app.element('#catalog').innerHTML,/Loading titles/);
    pending[0](response([title('movie:101','Ready immediately')]));
    await settle();
    await signInRememberedProfile(app);
    assert.match(app.element('#catalog').innerHTML,/Ready immediately/);
    assert.match(app.element('#catalog').innerHTML,/Loading titles/);
    pending.slice(1).forEach(resolve => resolve(response([title('movie:102','Other row')])));
    await settle();
    app.run("page = 'My list'; loadCatalog()");
    const returning = app.run("page = 'Discover'; loadCatalog()");
    assert.match(app.element('#catalog').innerHTML,/Ready immediately/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Finding your next story/);
    await returning;
    assert.equal(pending.length,4);
});

test('offscreen genres wait for visibility and navigation cancels waiting rows', async () => {
    const calls = [];
    const app = setup(async url => { calls.push(url); return response([title('movie:1','Loaded row')]); },new Map(),undefined,false,
        ['Horror','Romance','Comedy','Drama','Action','Fantasy'].map(label => genreFilter(label,'Movies')));
    await settle();
    await signInRememberedProfile(app);
    app.run(`
        globalThis.IntersectionObserver = class { constructor(callback) {} observe() {} disconnect() {} };
        discoverCache.clear();
        page = 'Movies';
        loadCatalog();
    `);
    await settle();
    assert.equal(calls.length,6);
    assert.equal(app.run('pendingRowVisibility.size'),4);
    app.run('pendingRowVisibility.get(2)()');
    await settle();
    assert.equal(calls.length,7);
    await app.run("page = 'My list'; loadCatalog()");
    await settle();
    assert.equal(app.run('pendingRowVisibility.size'),0);
    assert.equal(calls.length,7);
});

test('expired genre rows remain visible while refreshing', async () => {
    let fail = false;
    const app = setup(async () => fail ? {ok:false} : response([title('movie:1','Cached story')]),new Map(),undefined,false,[genreFilter('Horror','Movies')]);
    await settle();
    await signInRememberedProfile(app);
    app.run('discoverCache.forEach(entry => entry.expires = 0)');
    fail = true;
    const refreshing = app.run('loadCatalog()');
    assert.match(app.element('#catalog').innerHTML,/Cached story/);
    await refreshing;
    assert.match(app.element('#catalog').innerHTML,/Cached story/);
    assert.equal(app.element('#catalog-retry').hidden,false);
});

async function signInRememberedProfile(app) {
    const id = JSON.parse(app.storage.get('void.active') || 'null');
    if (!id || !app.database.profiles.has(id) || app.database.profiles.get(id).archived) return;
    await app.run(`selectProfile(${JSON.stringify(id)}); $('#entry-pin').value = '4567'; confirmProfileTransition()`);
    await settle();
}

test('remembered profiles stay locked and wrong PINs cannot open or edit them', async () => {
    const app = setup(async () => response([]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    assert.equal(app.run('activeProfile'),null);
    await app.run("selectProfile('joen'); $('#entry-pin').value = '9999'; confirmProfileTransition()");
    assert.equal(app.run('activeProfile'),null);
    assert.match(app.element('#profile-transition-error').textContent,/Incorrect PIN/);

});

test('reset PIN login requires changing PIN before entering the profile', async () => {
    const app = setup(async () => response([]));
    await settle();
    app.database.mustChangePin = true;
    await app.run("selectProfile('joen'); $('#entry-pin').value = '4567'; confirmProfileTransition()");
    assert.equal(app.run('activeProfile'),null);
    assert.equal(app.element('#pin-settings').open,true);
    app.element('#current-pin').value = '123';
    app.element('#changed-pin').value = '5678';
    app.element('#changed-pin-confirm').value = '5678';
    await app.element('#change-pin-form').listeners.submit({preventDefault(){}});
    assert.equal(app.run('activeProfile.id'),'joen');
    assert.equal(app.element('#pin-settings').open,false);
});

test('profile dropdown opens settings and only the active profile can be edited', async () => {
    const app = setup(async () => response([]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle(); await signInRememberedProfile(app);
    app.element('#profile-menu').hidden = true;
    app.element('#switch-profile').listeners.click();
    assert.equal(app.element('#profile-menu').hidden,false);
    app.element('#profile-settings').listeners.click();
    assert.equal(app.element('#profile-menu').hidden,true);
    assert.equal(app.element('#user-settings').open,true);
    app.element('#user-edit-profile').listeners.click();
    assert.equal(app.run('editingProfileId'),'joen');
    assert.equal(app.element('#profile-editor').open,true);
    app.run("resetProfileForm(); editProfile(profiles.find(profile => profile.id === 'guest'))");
    assert.equal(app.run('editingProfileId'),null);
});

test('admin navigation collapses the mobile menu and resets content scrolling', async () => {
    const app = setup(async () => response([]));
    await settle();
    app.element('#admin-menu-toggle').listeners.click();
    assert.equal(app.run('adminMenuOpen'),true);
    app.element('.admin-main').scrollTop = 240;
    app.element('#admin-nav-settings').listeners.click();
    assert.equal(app.run('adminMenuOpen'),false);
    assert.equal(app.element('#admin-settings-panel').hidden,false);
    assert.equal(app.element('#admin-accounts').hidden,true);
    assert.equal(app.element('.admin-main').scrollTop,0);
    app.element('#admin-menu-toggle').listeners.click();
    app.run('showAdminLogin()');
    assert.equal(app.run('adminMenuOpen'),false);
    assert.equal(app.element('#admin-menu-toggle').hidden,true);
    assert.equal(app.element('#admin-workspace').hidden,true);
});

test('authenticated profiles open before a slow watchlist finishes and saves wait for synchronization', async () => {
    const app = setup(async () => response([title('movie:42','Already saved')]));
    await settle();
    app.run("let finishWatchlist; readWatchlist = id => new Promise(resolve => { finishWatchlist = () => { savedLists[id] = ['movie:42']; resolve(); }; })");
    await app.run("selectProfile('joen'); $('#entry-pin').value = '4567'; confirmProfileTransition()");
    assert.equal(app.run('activeProfile.id'),'joen');
    assert.equal(app.element('#profiles').open,false);
    assert.equal(app.run("watchlistLoads.has('joen')"),true);
    const saving = app.run("toggleSave('movie:42')");
    assert.equal(app.run('pendingSaves.size'),0);
    app.run('finishWatchlist()');
    await saving;
    assert.equal(app.run("saved().includes('movie:42')"),false);
});

test('repeat searches reuse complete results while media filters and pages stay separate', async () => {
    const calls = [];
    const app = setup(async url => { calls.push(url); return response([title('movie:42','A result')]); });
    await settle();
    await app.run("query = 'Space'; loadCatalog()");
    const firstCount = calls.length;
    await app.run('loadCatalog()');
    assert.equal(calls.length,firstCount);
    assert.match(app.element('#catalog').innerHTML,/A result/);
    await app.run("page = 'Movies'; loadCatalog()");
    assert.equal(calls.length,firstCount + 1);
    await app.run('loadCatalog(true)');
    assert.equal(calls.length,firstCount + 2);
    app.run('searchCache.forEach(entry => entry.expires = 0)');
    await app.run('loadCatalog()');
    assert.equal(calls.length,firstCount + 3);
});

test('partial search results are retried rather than cached as complete', async () => {
    let searchCalls = 0;
    const app = setup(async url => {
        if (url.includes('q=Space')) {
            searchCalls++;
            return {ok:true,json:async () => ({source:'tmdb',results:[],page:1,has_more:false,unavailable:['tv']})};
        }
        return response([]);
    });
    await settle();
    await app.run("query = 'Space'; loadCatalog()");
    await app.run('loadCatalog()');
    assert.equal(searchCalls,2);
    assert.equal(app.element('#catalog-retry').hidden,false);
});

test('TMDB movies mount the player without a preparation request', async () => {
    const calls = [];
    const app = setup(async url => { calls.push(url); return response([title('movie:42','Play immediately')]); },new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42')");
    assert.match(app.element('#player-frame').innerHTML,/embed\/movie\/42/);
    assert.equal(calls.some(url => url.startsWith('/playback/')),false);
});

test('watch party locks movie switching for invited guests while allowing the host admin to switch titles', async () => {
    let partyRoom = null;
    const app = setup(async (url, options = {}) => {
        if (url === '/party' && options.method === 'POST') {
            const body = JSON.parse(options.body);
            partyRoom = {
                code: 'ROOM123456',
                host_profile_id: 'joen',
                host_name: 'Joen',
                is_host: true,
                title_key: body.title_key,
                title: title(body.title_key, body.title),
                season: body.season,
                episode: body.episode,
                position: body.position,
                is_playing: body.is_playing,
                members: [{id:'joen',name:'Joen'},{id:'guest',name:'Guest'}],
            };
            return {ok:true, json:async () => ({party: partyRoom})};
        }
        if (url === '/party/ROOM123456') {
            if (options.method === 'PUT') {
                const body = JSON.parse(options.body);
                partyRoom = {...partyRoom, title_key: body.title_key, title: title(body.title_key, body.title), position: body.position};
            }
            if (options.method === 'DELETE') {
                return {ok:true, json:async () => ({left:true})};
            }
            return {ok:true, json:async () => ({party: partyRoom})};
        }
        return response([title('movie:42','Host Movie'), title('movie:99','Other Movie')]);
    }, new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42')");
    await app.run('startWatchParty()');
    assert.equal(app.element('#party-bar').hidden, false);
    assert.equal(app.element('#party-role-badge').textContent, 'ADMIN · HOST');
    assert.equal(app.element('#party-end-label').textContent, 'End party');

    // Host switches movie -> allowed and updates party room
    await app.run("openPlayer('movie:99')");
    assert.equal(partyRoom.title_key, 'movie:99');

    // Now simulate Guest joining via invite link after logging into existing profile
    partyRoom = {...partyRoom, is_host: false, position: 75};
    await app.run("activeParty = null; pendingPartyCode = 'ROOM123456'; enterPendingWatchParty()");
    assert.equal(app.element('#party-role-badge').textContent, 'GUEST · LOCKED');
    assert.equal(app.element('#party-end-label').textContent, 'Leave party');
    assert.match(app.element('#player-frame').innerHTML, /embed\/movie\/99.*t=75/);

    // Guest tries to switch to movie:42 -> blocked!
    await app.run("openPlayer('movie:42')");
    assert.match(app.element('#toast').textContent, /Only the watch party admin can change the movie/);
    assert.match(app.element('#player-frame').innerHTML, /embed\/movie\/99/);
});

test('an invited guest follows the host without prompting or changing solo progress', async () => {
    const saved = {'joen:movie:42':{position:310,duration:600}};
    const storage = new Map([['void.active',JSON.stringify('joen')], ['void.playback.v1',JSON.stringify(saved)]]);
    let party = {code:'ROOM123456', host_name:'Host', is_host:false, title_key:'movie:42',
        title:title('movie:42','Party Movie'), position:0, is_playing:false};
    const app = setup(async url => url === '/party/ROOM123456'
        ? {ok:true, json:async () => ({party})}
        : response([party.title]), storage);
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42')");
    assert.match(app.element('#player-frame').innerHTML, /t=310/);

    await app.run("joinWatchParty('ROOM123456')");
    const partyFrame = app.element('#player-frame').innerHTML;
    assert.match(partyFrame, /continueprompt=false/);
    assert.match(partyFrame, /[&;]t=0(?:[&\"])/);
    assert.doesNotMatch(partyFrame, /t=310/);

    const commands = [];
    const iframe = app.element('#cinesrc-player');
    iframe.contentWindow.postMessage = (message, origin) => commands.push([message.command, Array.from(message.args), origin]);
    const sendEvent = (type, position = 0) => app.run(`handlePlayerMessage({origin:playerOrigin,source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:${type}',currentTime:${position},duration:600}})`);
    sendEvent('loadedmetadata');
    commands.length = 0;
    party = {...party, position:75, is_playing:true};
    await app.run('pollWatchParty()');
    assert.deepEqual(commands, [['seek',[75],'https://cinesrc.st'], ['play',[],'https://cinesrc.st']]);
    sendEvent('play', 75);

    commands.length = 0;
    party = {...party, position:80, is_playing:false};
    await app.run('pollWatchParty()');
    assert.deepEqual(commands, [['pause',[],'https://cinesrc.st'], ['seek',[80],'https://cinesrc.st']]);
    assert.equal(app.element('#player-frame').innerHTML, partyFrame);
    sendEvent('pause', 80);
    await app.run('leaveWatchParty()');
    assert.equal(app.element('#player').open, false);
    assert.deepEqual(JSON.parse(storage.get('void.playback.v1')), saved);
});

test('a signed-in viewer can see a new profile invitation and join it from the catalog', async () => {
    const movie = title('movie:42','Party Movie');
    const party = {code:'ROOM123456', host_name:'Joen', title_key:movie.id, title:movie, position:42, is_playing:false};
    const respond = data => ({ok:true, json:async () => data});
    let recipient = null;
    const host = setup(async (url, options) => {
        if (url === '/party') return respond({party:{...party,is_host:true}});
        if (url === '/party/ROOM123456/invitations') {
            assert.equal(options.headers['X-Viewer-Token'], 'viewer-joen');
            recipient = JSON.parse(options.body).profile_id;
            return respond({invited:true});
        }
        return response([movie]);
    }, new Map([['void.active',JSON.stringify('joen')]]));
    const guest = setup(async (url, options) => {
        if (url === '/party-invitations') {
            assert.equal(options.headers['X-Viewer-Token'], 'viewer-guest');
            return respond({invitations:recipient === 'guest'
                ? [{code:party.code, title:movie.title, host_name:party.host_name}] : []});
        }
        if (url === '/party/ROOM123456') return respond({party:{...party,is_host:false}});
        return response([movie]);
    }, new Map([['void.active',JSON.stringify('guest')]]));
    await settle();
    await signInRememberedProfile(host);
    await signInRememberedProfile(guest);
    assert.equal(guest.element('#party-invitations').hidden, true);

    await host.run("openPlayer('movie:42'); startWatchParty()");
    host.element('#party-invite').listeners.click();
    assert.match(host.element('#party-invite-profile').innerHTML, /value="guest"/);
    assert.doesNotMatch(host.element('#party-invite-profile').innerHTML, /value="joen"/);
    host.element('#party-invite-profile').value = 'guest';
    await host.element('#party-invite-form').listeners.submit({preventDefault() {}});
    assert.equal(host.element('#party-invite-status').textContent, 'Invitation sent.');

    const poll = [...guest.timers.values()].find(timer => timer.delay === 15000);
    await poll.callback();
    assert.equal(guest.element('#party-notifications').hidden, false);
    assert.equal(guest.element('#party-invitation-count').textContent, '1');
    assert.equal(guest.element('#party-invitations').hidden, true);
    guest.element('#profile-menu').hidden = true;
    const bell = guest.element('#party-notification-toggle');
    bell.listeners.pointerenter({pointerType:'mouse'});
    assert.equal(guest.element('#party-invitations').hidden, false);
    guest.element('#party-notifications').listeners.pointerleave({pointerType:'mouse'});
    assert.equal(guest.element('#party-invitations').hidden, true);
    bell.listeners.click();
    assert.equal(guest.element('#party-invitations').hidden, false);
    assert.match(guest.element('#party-invitations-list').innerHTML, /Party Movie.*Invited by Joen/);
    await guest.element('#party-invitations-list').listeners.click({target:{closest:() => ({dataset:{partyJoin:party.code}})}});
    assert.match(guest.element('#player-frame').innerHTML, /continueprompt=false.*t=42/);
    assert.equal(guest.element('#party-invitations').hidden, true);
    assert.equal(guest.element('#party-invitation-count').hidden, true);
});

test('ended parties disappear from the open invitation bell and its badge', async () => {
    let invitations = [
        {code:'ROOM123456', title:'First Movie', host_name:'Joen'},
        {code:'ROOM654321', title:'Second Movie', host_name:'Alex'},
    ];
    const guest = setup(async url => url === '/party-invitations'
        ? {ok:true, json:async () => ({invitations})}
        : response([]), new Map([['void.active',JSON.stringify('guest')]]));
    await settle();
    await signInRememberedProfile(guest);
    assert.equal(guest.element('#party-invitation-count').textContent, '2');

    invitations = invitations.slice(1);
    guest.element('#party-notification-toggle').listeners.click();
    await settle();
    assert.equal(guest.element('#party-invitation-count').textContent, '1');
    assert.doesNotMatch(guest.element('#party-invitations-list').innerHTML, /First Movie/);
    assert.match(guest.element('#party-invitations-list').innerHTML, /Second Movie/);

    invitations = [];
    const poll = [...guest.timers.values()].find(timer => timer.delay === 5000);
    await poll.callback();
    assert.equal(guest.element('#party-invitations').hidden, false);
    assert.equal(guest.element('#party-invitations-list').innerHTML, '');
    assert.equal(guest.element('#party-invitations-empty').hidden, false);
    assert.equal(guest.element('#party-invitation-count').hidden, true);
});

test('the host keeps party controls until the server confirms the room ended', async () => {
    const movie = title('movie:42','Party Movie');
    let ended = false;
    const app = setup(async (url, options) => {
        if (url === '/party') return {ok:true, json:async () => ({party:{code:'ROOM123456', is_host:true}})};
        if (url === '/party/ROOM123456' && options.method === 'DELETE') {
            return {ok:true, json:async () => ended ? {ended:true} : {left:true}};
        }
        return response([movie]);
    }, new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42'); startWatchParty()");
    await app.run('leaveWatchParty()');
    assert.equal(app.element('#party-bar').hidden, false);
    assert.match(app.element('#toast').textContent, /room is still open/);

    ended = true;
    await app.run('leaveWatchParty()');
    assert.equal(app.element('#party-bar').hidden, true);
    assert.equal(app.element('#party-start').hidden, false);
});

test('watch party drawer renders live participants and supports quick-invite chips', async () => {
    const movie = title('movie:42','Dune: Part Two');
    const invited = [];
    const party = {
        code:'ROOM999888', host_profile_id:'joen', host_name:'Joen', is_host:true,
        title_key:movie.id, title:movie, position:15, is_playing:true,
        members:[{id:'joen', name:'Joen', avatar:'violet'}, {id:'guest', name:'Guest', avatar:'moon'}],
    };
    const app = setup(async (url, options) => {
        if (url === '/party') return {ok:true, json:async () => ({party})};
        if (url === '/party/ROOM999888/invitations') {
            invited.push(JSON.parse(options.body).profile_id);
            return {ok:true, json:async () => ({invited:true})};
        }
        return response([movie]);
    }, new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('movie:42'); startWatchParty()");
    assert.equal(app.element('#party-drawer').hidden, false);
    assert.equal(app.element('#party-drawer-count').textContent, '2');
    assert.match(app.element('#party-roster').innerHTML, /Joen \(You\).*Host · Controlling playback/);
    assert.match(app.element('#party-roster').innerHTML, /Guest.*Synced · Following host/);
    await app.run("quickInviteProfile('guest')");
    assert.deepEqual(invited, ['guest']);
});

test('viewers can join a watch party by room code or full invite URL from the invitation panel', async () => {
    const movie = title('movie:42','Severance');
    const party = {code:'ROOM123456', host_profile_id:'joen', host_name:'Joen', is_host:false, title_key:movie.id, title:movie, position:30, is_playing:false};
    const app = setup(async url => {
        if (url === '/party-invitations') return {ok:true, json:async () => ({invitations:[{code:'ROOM123456', title:'Severance', host_name:'Joen'}]})};
        if (url === '/party/ROOM123456') return {ok:true, json:async () => ({party})};
        return response([movie]);
    }, new Map([['void.active',JSON.stringify('guest')]]));
    await settle();
    await signInRememberedProfile(app);
    assert.equal(app.element('#live-parties-strip').hidden, false);
    assert.match(app.element('#live-parties-cards').innerHTML, /Severance.*Hosted by Joen/);
    app.element('#party-code-input').value = 'https://the-void.local/?party=ROOM123456';
    await app.element('#party-code-form').listeners.submit({preventDefault() {}});
    assert.match(app.element('#player-frame').innerHTML, /embed\/movie\/42.*t=30/);
    assert.equal(app.element('#party-code-input').value, '');
});

test('clicking a direct Watch Party CTA opens the player and starts a watch party room immediately', async () => {
    const movie = title('movie:42','Dune: Part Two');
    const party = {code:'DIRECT1234', host_profile_id:'joen', host_name:'Joen', is_host:true, title_key:movie.id, title:movie, position:0, is_playing:false, members:[{id:'joen',name:'Joen'}]};
    const app = setup(async (url, options) => {
        if (url === '/party' && options.method === 'POST') return {ok:true, json:async () => ({party})};
        return response([movie]);
    }, new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await signInRememberedProfile(app);
    await app.run("openAndStartWatchParty('movie:42')");
    assert.equal(app.element('#player').open, true);
    assert.equal(app.element('#party-bar').hidden, false);
    assert.equal(app.element('#party-room-code').textContent, '#DIRECT1234');
    assert.equal(app.element('#party-drawer').hidden, false);
});

test('series player renders interactive season pill tabs and prevents redundant reloads on active season', async () => {
    let seasonCalls = 0;
    const app = seriesPlayer(async url => {
        seasonCalls++;
        const s = url.endsWith('/2') ? 2 : 1;
        return seasonResponse(s, [{number:1, name:`S${s} Pilot`, air_date:'2026-01-01', released:true}]);
    });
    await settle();
    await signInRememberedProfile(app);
    await app.run("openPlayer('tv:42')");
    assert.equal(seasonCalls, 1);
    assert.match(app.element('#season-pills').innerHTML, /Season 1 \(3\)/);
    assert.match(app.element('#season-pills').innerHTML, /Season 2 \(2\)/);

    // Clicking already-active Season 1 pill does not trigger a duplicate fetch
    app.element('#season-pills').listeners.click({target:{closest:() => ({dataset:{seasonPill:'1'}, disabled:false})}});
    await settle();
    assert.equal(seasonCalls, 1);

    // Clicking Season 2 pill switches season and loads episodes
    app.element('#season-pills').listeners.click({target:{closest:() => ({dataset:{seasonPill:'2'}, disabled:false})}});
    await settle();
    assert.equal(seasonCalls, 2);
    assert.match(app.element('#episode-tiles').innerHTML, /S2 Pilot/);
});

test('TV on-screen profile PIN keypad hides during sign-out confirmation and supports clear/backspace', async () => {
    const app = setup(async () => response([]));
    await settle();
    app.run("selectProfile('joen')");
    assert.equal(app.element('#entry-pin-keypad').hidden, false);
    app.element('#entry-pin').value = '45678';
    app.element('#entry-pin-backspace').listeners.click();
    assert.equal(app.element('#entry-pin').value, '4567');
    await app.run('confirmProfileTransition()');
    assert.equal(app.run('activeProfile.id'), 'joen');

    app.element('#profile-signout').listeners.click();
    assert.equal(app.element('#entry-pin-keypad').hidden, true);
    app.element('#cancel-profile-transition').listeners.click();

    app.run("selectProfile('guest')");
    assert.equal(app.element('#entry-pin-keypad').hidden, false);
    app.element('#entry-pin').value = '99';
    app.element('#entry-pin-clear').listeners.click();
    assert.equal(app.element('#entry-pin').value, '');
});
