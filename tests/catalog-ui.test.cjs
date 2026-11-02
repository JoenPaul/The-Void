const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync('public/js/cinema.js', 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = results => ({ ok: true, json: async () => ({source: 'tmdb', results, page: 1, has_more: true}) });
const title = (id, name) => ({id, title: name, type: 'Movies', year: '2024', genre: 'Drama', genres: ['Drama'], rating: '8', image: null, description: 'A story.'});

function setup(fetch, storage = new Map(), database = {profiles:new Map(), lists:new Map(), failWrites:false}, withReleases = false, genreFilters = []) {
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
            if (!url.startsWith('/profiles')) return fetch(url, options);
            const parts = url.split('/').map(decodeURIComponent);
            const method = options.method || 'GET';
            const body = options.body ? JSON.parse(options.body) : null;
            const result = data => ({ok:true,json:async () => data});
            if (database.failWrites && method !== 'GET') return {ok:false,status:503,json:async () => ({})};
            if (parts.length === 2) return result({profiles:[...database.profiles.values()].filter(profile => !profile.archived).map(profile => ({...profile})),archived_ids:[...database.profiles.values()].filter(profile => profile.archived).map(profile => profile.id)});
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
    vm.runInContext(readFileSync('public/js/history.js','utf8'), context);
    vm.runInContext(readFileSync('public/js/playback.js','utf8'), context);
    if (withReleases) vm.runInContext(readFileSync('public/js/releases.js','utf8'), context);
    return {run: code => vm.runInContext(code, context), element, storage, database,timers,motion};
}

test('a failed catalog request shows a retryable error without preview titles', async () => {
    let calls = 0;
    const app = setup(async () => { calls++; return calls === 1 ? {ok:false} : response([title('movie:42','Recovered title')]); });
    await settle();
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
    assert.match(app.element('#catalog').innerHTML, /Latest title/);
    assert.doesNotMatch(app.element('#catalog').innerHTML, /Old result/);
});

test('saved live titles survive reloads and stay separate between profiles', async () => {
    const storage = new Map([['void.active', JSON.stringify('joen')], ['void.lists', JSON.stringify({joen:[1]})]]);
    const app = setup(async () => response([title('movie:42', 'Saved live title')]), storage);
    await settle();
    await app.run("toggleSave('movie:42');");
    assert.deepEqual(JSON.parse(storage.get('void.lists')).joen, ['movie:693134', 'movie:42']);
    const reloaded = setup(async () => ({ok: true, json: async () => ({source:'tmdb',results:[]})}), storage, app.database);
    await settle();
    reloaded.run("page = 'My list'; render();");
    assert.match(reloaded.element('#catalog').innerHTML, /Saved live title/);
    assert.match(reloaded.element('#catalog').innerHTML, /Dune: Part Two/);
    reloaded.run("activeProfile = profiles.find(profile => profile.id === 'guest'); render();");
    assert.doesNotMatch(reloaded.element('#catalog').innerHTML, /Saved live title/);
});

test('database watchlists survive clearing browser storage', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await app.run("toggleSave('movie:42')");
    const cleanBrowser = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[]})}), new Map(), app.database);
    await settle();
    await cleanBrowser.run("selectProfile('joen'); confirmProfileTransition()");
    cleanBrowser.run("page = 'My list'; render()");
    assert.match(cleanBrowser.element('#catalog').innerHTML, /A saved movie/);
});

test('failed saves do not change the list or claim success', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    app.database.failWrites = true;
    await app.run("toggleSave('movie:42')");
    assert.equal(app.run("saved().includes('movie:42')"),false);
    assert.match(app.element('#toast').textContent,/Could not reach/);
});

test('legacy import runs once and does not resurrect removed titles', async () => {
    const storage = new Map([['void.active',JSON.stringify('joen')],['void.lists',JSON.stringify({joen:[1]})]]);
    const app = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[]})}),storage);
    await settle();
    assert.equal(app.database.lists.get('joen').size,1);
    app.database.lists.get('joen').clear();
    const reloaded = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[]})}),storage,app.database);
    await settle();
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
    await app.run("toggleSave('wiki:aaaaaaaaaaaaaaaaaaaaaaaa')");
    const reloaded = setup(async () => response([]), storage, app.database);
    await settle();
    reloaded.run("showDetails('wiki:aaaaaaaaaaaaaaaaaaaaaaaa')");
    assert.match(reloaded.element('#detail-content').innerHTML, /upload.wikimedia.org/);
    assert.match(reloaded.element('#detail-content').innerHTML, /Wikipedia · adapted synopsis/);
    assert.equal(reloaded.run("sourceCredit({source_url:'javascript:alert(1)'})"), '');
});

test('a partial catalog failure keeps available titles and offers retry', async () => {
    const app = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[title('wiki:aaaaaaaaaaaaaaaaaaaaaaaa','Available movie')],page:1,has_more:false,unavailable:['tv']})}));
    await settle();
    assert.match(app.element('#catalog').innerHTML, /Available movie/);
    assert.match(app.element('#catalog-status').textContent, /Part of the catalog/);
    assert.equal(app.element('#catalog-retry').hidden, false);
});

test('movie player uses a fixed sandboxed origin and resumes only trusted progress for the selected profile', async () => {
    const storage = new Map([['void.active', JSON.stringify('joen')]]);
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','Watch this')]), storage);
    await settle();
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
    const app = setup(async url => url.startsWith('/playback/') ? new Promise(resolve => { finish = resolve; }) : response([title('movie:42','Watch this')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    const pending = app.run("openPlayer('movie:42')");
    app.run('closePlayer()');
    finish({ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})});
    await pending;
    assert.equal(app.element('#player-frame').innerHTML,'');
    assert.equal(app.element('#player').open,false);
});

test('an empty partial response does not claim a complete search had no matches', async () => {
    const app = setup(async () => ({ok:true,json:async () => ({source:'tmdb',results:[],page:1,has_more:false,unavailable:['movie']})}));
    await settle();
    assert.match(app.element('#catalog').innerHTML, /Search is incomplete/);
    assert.equal(app.element('#catalog-retry').hidden, false);
});

test('new-release carousel advances horizontally after its delay and pauses for interaction and dialogs', async () => {
    const releases = [{...title('movie:81','First release'),backdrop:'https://image.tmdb.org/t/p/w1280/art.jpg',release_date:'2026-10-20'},title('movie:82','Second release')];
    const app = setup(async url => url === '/releases' ? response(releases) : response([]),new Map([['void.active',JSON.stringify('joen')]]),undefined,true);
    await settle();
    assert.match(app.element('#release-track').innerHTML, /First release/);
    assert.doesNotMatch(app.element('#release-track').innerHTML, /My list|Dune: Part Two/);
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
    assert.match(app.element('#release-status').textContent,/couldn’t load/);
    assert.equal(app.element('#retry-releases').hidden,false);
    assert.equal(app.run('releaseMovies.length'),0);
});

test('recent history starts after real playback and survives a new browser without mixing profiles', async () => {
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','Recently played')]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
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
    await reloaded.run("selectProfile('joen'); confirmProfileTransition()");
    await settle();
    assert.match(reloaded.element('#recent-content').innerHTML,/Recently played/);
    assert.equal(JSON.parse(reloaded.storage.get('void.playback.v1'))['joen:movie:42'].position,120);
    await reloaded.run("selectProfile('guest'); confirmProfileTransition()");
    await settle();
    assert.doesNotMatch(reloaded.element('#recent-content').innerHTML,/Recently played/);
});

test('history stays with the playback profile if the active profile changes during a save', async () => {
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','A movie')]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
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
    app.run("genre='Fantasy'; render()");
    assert.match(app.element('#catalog').innerHTML,/Sci-Fi &amp; Fantasy series/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Drama series/);
});

test('genre row arrows move a page and disable at either end', async () => {
    const app = setup(async () => response([]));
    await settle();
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
    assert.equal(calls.length,4);
    assert.equal(calls.filter(params => params.get('type') === 'tv').length,1);
    assert.match(app.element('#catalog').innerHTML,/Romance movies/);
    assert.match(app.element('#catalog').innerHTML,/New movie releases/);
    assert.match(app.element('#catalog').innerHTML,/New series releases/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Sci-Fi movies|Sci-Fi &amp; Fantasy series/);
    assert.equal((app.element('#catalog').innerHTML.match(/8 titles to explore/g) || []).length,4);
    assert.equal(calls.filter(params => params.get('collection') === 'recent').length,2);
    assert.equal(filters.find(button => button.dataset.genre === 'Sci-Fi').hidden,true);
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
    assert.match(app.element('#catalog').innerHTML,/Search winner/);
    assert.doesNotMatch(app.element('#catalog').innerHTML,/Stale genre/);
    assert.equal(pending.length,4);
});

test('archiving requires confirmation, preserves data, and clears an archived active profile without resurrecting it', async () => {
    const storage = new Map([['void.active',JSON.stringify('joen')]]);
    const app = setup(async () => response([]),storage);
    await settle();
    app.run("editingProfiles = true; selectProfile('joen'); requestProfileArchive();");
    assert.equal(app.database.profiles.get('joen').archived,undefined);
    assert.equal(app.element('#archive-confirmation').open,true);
    assert.match(app.element('#archive-title').textContent,/Joen/);
    app.element('#cancel-archive').listeners.click();
    assert.equal(app.element('#archive-confirmation').open,false);
    assert.equal(app.database.profiles.get('joen').archived,undefined);
    app.run('requestProfileArchive()');
    app.database.lists.get('joen').set('movie:42',title('movie:42','Kept movie'));
    await app.run('confirmProfileArchive()');
    assert.equal(app.database.profiles.get('joen').archived,true);
    assert.ok(app.database.lists.get('joen').has('movie:42'));
    assert.equal(app.run('activeProfile'),null);
    assert.equal(JSON.parse(storage.get('void.active')),null);
    assert.equal(app.element('#archive-confirmation').open,false);
    storage.set('void.profiles',JSON.stringify([{id:'joen',name:'Joen'},{id:'guest',name:'Guest'}]));
    const reloaded = setup(async () => response([]),storage,app.database);
    await settle();
    assert.equal(reloaded.run("profiles.some(profile => profile.id === 'joen')"),false);
    assert.equal(app.database.profiles.get('joen').archived,true);
});

test('a failed archive keeps the profile and confirmation open with a visible error', async () => {
    const app = setup(async () => response([]));
    await settle();
    app.run("editingProfiles = true; selectProfile('guest'); requestProfileArchive();");
    app.database.failWrites = true;
    await app.run('confirmProfileArchive()');
    assert.equal(app.database.profiles.get('guest').archived,undefined);
    assert.equal(app.element('#archive-confirmation').open,true);
    assert.match(app.element('#archive-error').textContent,/Could not reach/);
    assert.equal(app.element('#confirm-archive').disabled,false);
});

test('entering and leaving profiles require confirmation and Cancel keeps the current profile', async () => {
    const app = setup(async () => response([]));
    await settle();
    app.run("selectProfile('joen')");
    assert.equal(app.run('activeProfile'),undefined);
    assert.equal(app.element('#profile-confirmation').open,true);
    assert.equal(app.element('#profile-confirm-title').textContent,'Watch as Joen?');
    app.element('#cancel-profile-transition').listeners.click();
    assert.equal(app.run('activeProfile'),undefined);
    assert.equal(app.element('#profile-confirmation').open,false);
    await app.run("selectProfile('joen'); confirmProfileTransition()");
    assert.equal(app.run('activeProfile.id'),'joen');
    assert.equal(app.element('#profile-confirmation').open,false);
    app.element('#switch-profile').listeners.click();
    assert.equal(app.run('activeProfile.id'),'joen');
    assert.match(app.element('#profile-confirm-title').textContent,/Leave Joen/);
    app.element('#cancel-profile-transition').listeners.click();
    assert.equal(app.run('activeProfile.id'),'joen');
    app.element('#switch-profile').listeners.click();
    await app.run('confirmProfileTransition()');
    assert.equal(app.run('activeProfile'),null);
    assert.equal(JSON.parse(app.storage.get('void.active')),null);
    assert.equal(app.element('#profiles').open,true);
    assert.equal(app.element('#profile-confirmation').open,false);
    await app.run("selectProfile('guest'); confirmProfileTransition()");
    assert.equal(app.run('activeProfile.id'),'guest');
});

test('a profile entry failure leaves confirmation open and does not change the selected profile', async () => {
    const app = setup(async () => response([]),new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    app.run("readWatchlist = async () => {throw new Error('Could not load this profile.');}; selectProfile('guest')");
    await app.run('confirmProfileTransition()');
    assert.equal(app.run('activeProfile.id'),'joen');
    assert.equal(app.element('#profile-confirmation').open,true);
    assert.equal(app.element('#profile-transition-error').textContent,'Could not load this profile.');
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

test('episode tiles count releases, resume an aired episode, and explain upcoming episodes without playing them', async () => {
    const app = seriesPlayer(async () => seasonResponse(1,[
        {number:1,name:'<Pilot>',air_date:'2026-01-01',released:true},
        {number:2,name:'Soon',air_date:'2099-01-01',released:false},
        {number:3,name:'Unknown',air_date:null,released:false},
    ]));
    await settle();
    app.storage.set('void.playback.v1',JSON.stringify({'joen:tv:42':{season:1,episode:1,position:45,duration:1000}}));
    await app.run("openPlayer('tv:42')");
    assert.equal(app.element('#episode-count').textContent,'1 of 3 episodes released');
    assert.match(app.element('#episode-tiles').innerHTML,/&lt;Pilot&gt;|Not yet available/);
    assert.match(app.element('#player-frame').innerHTML,/e=1.*t=45/);
    const player = app.element('#player-frame').innerHTML;
    app.run('playSelectedEpisode(2)');
    assert.match(app.element('#episode-message').textContent,/Episode not yet available.*2099-01-01/);
    assert.equal(app.element('#player-frame').innerHTML,player);
    app.run('playSelectedEpisode(3)');
    assert.match(app.element('#episode-message').textContent,/not been announced/);
});

test('unreleased seasons never mount a player and failed episode feeds offer retry', async () => {
    let failed = false;
    const app = seriesPlayer(async () => failed ? {ok:false} : seasonResponse(1,[{number:1,name:'Upcoming',air_date:'2099-01-01',released:false}]));
    await settle();
    await app.run("openPlayer('tv:42')");
    assert.equal(app.element('#episode-count').textContent,'0 of 1 episodes released');
    assert.equal(app.element('#player-frame').innerHTML,'');
    assert.match(app.element('#episode-message').textContent,/not yet available/);
    failed = true;
    await app.run('loadSeasonEpisodes()');
    assert.equal(app.element('#retry-episodes').hidden,false);
    assert.equal(app.element('#player-frame').innerHTML,'');
});

test('late season responses cannot overwrite the newly selected season or reopen a closed player', async () => {
    const pending = [];
    const app = seriesPlayer((url,options) => new Promise(resolve => pending.push({url,resolve,signal:options.signal})));
    await settle();
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
    app.run('discoverCache.forEach(entry => entry.expires = 0)');
    fail = true;
    const refreshing = app.run('loadCatalog()');
    assert.match(app.element('#catalog').innerHTML,/Cached story/);
    await refreshing;
    assert.match(app.element('#catalog').innerHTML,/Cached story/);
    assert.equal(app.element('#catalog-retry').hidden,false);
});
