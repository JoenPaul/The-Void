<?php

use App\Http\Controllers\CatalogController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\PlaybackController;
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
    Route::delete('/profiles/{profile}', 'archive')->where('profile', '[A-Za-z0-9-]{1,64}');
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
