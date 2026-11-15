<?php

use App\Http\Controllers\CatalogController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\PlaybackController;
use App\Http\Controllers\WatchPartyController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('cinema', ['genres' => CatalogController::genreLabels(),
        'movieGenres' => CatalogController::genreLabels('movie'), 'seriesGenres' => CatalogController::genreLabels('tv')]);
});

Route::get('/catalog', CatalogController::class)->middleware('throttle:60,1,catalog:')->name('catalog');
Route::get('/releases', [CatalogController::class, 'releases'])->middleware('throttle:60,1,releases:');
Route::get('/playback/{title}', PlaybackController::class)
    ->where('title', '((movie|tv|tvmaze):[1-9][0-9]{0,9}|wiki:[a-f0-9]{24})')->middleware('throttle:30,1,playback:');
Route::get('/playback/tv/{series}/season/{season}', [PlaybackController::class, 'episodes'])
    ->where('series', '[1-9][0-9]{0,9}')->where('season', '0|[1-9][0-9]{0,3}')->middleware('throttle:60,1,episodes:');

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

Route::post('/profiles/{profile}/login', [\App\Http\Controllers\ProfileAuthController::class, 'login'])->middleware('throttle:5,1,profile-login:');
Route::post('/profile-logout', [\App\Http\Controllers\ProfileAuthController::class, 'logout']);
Route::put('/profiles/{profile}/pin', [\App\Http\Controllers\ProfileAuthController::class, 'changePin'])->middleware('throttle:5,1,profile-pin:');
Route::post('/superadmin/login', [\App\Http\Controllers\SuperadminController::class, 'login'])->middleware('throttle:5,1,admin-login:');
Route::post('/superadmin/logout', [\App\Http\Controllers\SuperadminController::class, 'logout']);
Route::get('/superadmin/profiles', [\App\Http\Controllers\SuperadminController::class, 'profiles']);
Route::put('/superadmin/profiles/{profile}/pin', [\App\Http\Controllers\SuperadminController::class, 'resetPin'])->middleware('throttle:30,1,admin-reset:');

Route::put('/superadmin/pin', [\App\Http\Controllers\SuperadminController::class, 'changePin'])->middleware('throttle:5,1,admin-pin:');

Route::put('/superadmin/profiles/{profile}/archive', [\App\Http\Controllers\SuperadminController::class, 'setArchived'])->middleware('throttle:30,1,admin-archive:');

Route::controller(WatchPartyController::class)->group(function () {
    Route::post('/party', 'store')->middleware('throttle:15,1,party-create:');
    Route::get('/party-invitations', 'invitations')->middleware('throttle:60,1,party-inbox:');
    Route::put('/party/{code}/invitations', 'invite')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:30,1,party-invite:');
    Route::get('/party/{code}', 'show')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:120,1,party-poll:');
    Route::put('/party/{code}', 'update')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:60,1,party-sync:');
    Route::delete('/party/{code}', 'destroy')->where('code', '[A-Za-z0-9]{6,24}')->middleware('throttle:30,1,party-leave:');
});
