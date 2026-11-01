<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PlaybackTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.tmdb.token' => 'private-test-token']);
        Cache::flush();
        Http::preventStrayRequests();
    }

    public function test_tmdb_movies_need_no_external_lookup_and_never_expose_credentials(): void
    {
        $this->getJson('/playback/movie:42')->assertOk()->assertJsonPath('type', 'movie')
            ->assertJsonPath('id', '42')->assertDontSee('private-test-token');
        $this->getJson('/playback/movie:0')->assertNotFound();
        $this->getJson('/playback/untrusted:42')->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_tvmaze_series_are_matched_by_imdb_and_seasons_are_cached(): void
    {
        Http::fake([
            'api.tvmaze.com/shows/42' => Http::response(['externals' => ['imdb' => 'tt123456']]),
            'api.themoviedb.org/3/find/tt123456*' => Http::response(['tv_results' => [['id' => 99]]]),
            'api.themoviedb.org/3/tv/99' => Http::response(['seasons' => [
                ['season_number' => 0, 'episode_count' => 0, 'name' => 'Specials'],
                ['season_number' => 1, 'episode_count' => 10, 'name' => 'Season 1'],
            ]]),
        ]);
        $this->getJson('/playback/tvmaze:42')->assertOk()->assertJsonPath('type', 'tv')->assertJsonPath('id', '99')
            ->assertJsonCount(1, 'seasons')->assertJsonPath('seasons.0.episodes', 10)->assertDontSee('private-test-token');
        $this->getJson('/playback/tvmaze:42')->assertOk();
        Http::assertSentCount(3);
    }

    public function test_wikipedia_movies_require_a_unique_title_and_year_match(): void
    {
        $id = 'wiki:'.str_repeat('a', 24);
        DB::table('catalog_movies')->insert(['id' => $id, 'title' => 'A Film', 'year' => 2023, 'genres' => '[]', 'details' => '{}']);
        Http::fake(['*' => Http::sequence()->push(['results' => [
            ['id' => 42, 'title' => 'A Film', 'release_date' => '2023-01-01'],
            ['id' => 43, 'title' => 'A Film', 'release_date' => '2022-01-01'],
        ]])->push(['results' => []])]);
        $this->getJson('/playback/'.$id)->assertOk()->assertJsonPath('id', '42');
        Cache::flush();
        $this->getJson('/playback/'.$id)->assertStatus(503);
    }

    public function test_provider_failures_and_missing_credentials_are_sanitized(): void
    {
        Http::fake(['*' => Http::response(['error' => 'private-test-token'], 500)]);
        $this->getJson('/playback/tv:42')->assertStatus(503)->assertDontSee('private-test-token');
        config(['services.tmdb.token' => null]);
        $this->getJson('/playback/tvmaze:42')->assertStatus(503);
        $this->getJson('/playback/movie:42')->assertOk();
    }
}
