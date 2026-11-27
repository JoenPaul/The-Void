<?php

use App\Http\Controllers\CatalogController;
use App\Http\Controllers\PlaybackController;
use App\Http\Controllers\ProfileAuthController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SuperadminController;
use App\Http\Controllers\WatchPartyController;
use App\Http\Middleware\CachePublicResponse;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

Route::get('/', function () {
    return view('cinema', ['genres' => CatalogController::genreLabels(),
        'movieGenres' => CatalogController::genreLabels('movie'), 'seriesGenres' => CatalogController::genreLabels('tv')]);
});

/*
 * Public, non-personalized endpoints: sessions and cookies are skipped so the
 * CDN can cache the responses and repeat requests never reach PHP.
 */
Route::withoutMiddleware([
    EncryptCookies::class, AddQueuedCookiesToResponse::class, StartSession::class,
    ShareErrorsFromSession::class, PreventRequestForgery::class,
])->group(function () {
    Route::get('/catalog', CatalogController::class)
        ->middleware(['throttle:60,1,catalog:', CachePublicResponse::class.':900,60'])->name('catalog');
    Route::get('/releases', [CatalogController::class, 'releases'])
        ->middleware(['throttle:60,1,releases:', CachePublicResponse::class.':1800,300']);
    Route::get('/playback/{title}', PlaybackController::class)
        ->where('title', '((movie|tv|tvmaze):[1-9][0-9]{0,9}|wiki:[a-f0-9]{24})')
        ->middleware(['throttle:30,1,playback:', CachePublicResponse::class.':3600,300']);
    Route::get('/playback/tv/{series}/season/{season}', [PlaybackController::class, 'episodes'])
        ->where('series', '[1-9][0-9]{0,9}')->where('season', '0|[1-9][0-9]{0,3}')
        ->middleware(['throttle:60,1,episodes:', CachePublicResponse::class.':1800,300']);
});

Route::controller(ProfileController::class)->group(function () {
    Route::get('/profiles', 'index');
    Route::put('/profiles/{profile}', 'store')->where('profile', '[A-Za-z0-9-]{1,64}');
    Route::get('/profiles/{profile}/watchlist', 'watchlist')->where('profile', '[A-Za-z0-9-]{1,64}');
    Route::get('/profiles/{profile}/history', 'history')->where('profile', '[A-Za-z0-9-]{1,64}');
    Route::put('/profiles/{profile}/history/{title}', 'recordWatch')
        ->where('profile', '[A-Za-z0-9-]{1,64}')->where('title', '((movie|tv|tvmaze):[0-9]{1,20}|wiki:[a-f0-9]{24})')
        ->middleware('throttle:30,1,history:');
    Route::put('/profiles/{profile}/watchlist/{title}', 'saveTitle')
        ->where('profile', '[A-Za-z0-9-]{1,64}')->where('title', '((movie|tv|tvmaze):[0-9]{1,20}|wiki:[a-f0-9]{24})');
    Route::delete('/profiles/{profile}/watchlist/{title}', 'removeTitle')
        ->where('profile', '[A-Za-z0-9-]{1,64}')->where('title', '((movie|tv|tvmaze):[0-9]{1,20}|wiki:[a-f0-9]{24})');
});

Route::post('/profiles/{profile}/login', [ProfileAuthController::class, 'login'])->middleware('throttle:5,1,profile-login:');
Route::post('/profile-logout', [ProfileAuthController::class, 'logout']);
Route::put('/profiles/{profile}/pin', [ProfileAuthController::class, 'changePin'])->middleware('throttle:5,1,profile-pin:');
Route::post('/superadmin/login', [SuperadminController::class, 'login'])->middleware('throttle:5,1,admin-login:');
Route::post('/superadmin/logout', [SuperadminController::class, 'logout']);
Route::get('/superadmin/profiles', [SuperadminController::class, 'profiles']);
Route::put('/superadmin/profiles/{profile}/pin', [SuperadminController::class, 'resetPin'])->middleware('throttle:30,1,admin-reset:');

Route::put('/superadmin/pin', [SuperadminController::class, 'changePin'])->middleware('throttle:5,1,admin-pin:');

Route::put('/superadmin/profiles/{profile}/archive', [SuperadminController::class, 'setArchived'])->middleware('throttle:30,1,admin-archive:');

Route::controller(WatchPartyController::class)->group(function () {
    Route::post('/party', 'store')->middleware('throttle:15,1,party-create:');
    Route::get('/party-invitations', 'invitations')->middleware('throttle:60,1,party-inbox:');
    Route::put('/party/{code}/invitations', 'invite')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:30,1,party-invite:');
    Route::get('/party/{code}', 'show')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:120,1,party-poll:');
    Route::put('/party/{code}', 'update')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:60,1,party-sync:');
    Route::delete('/party/{code}', 'destroy')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:30,1,party-leave:');
});
