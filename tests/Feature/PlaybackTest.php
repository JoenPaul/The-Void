<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
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

    public function test_loading_discover_genres_does_not_consume_the_playback_request_limit(): void
    {
        Http::fake(['*' => Http::response(['results' => [], 'total_pages' => 1])]);
        for ($request = 0; $request < 35; $request++) {
            $this->getJson('/catalog?type=movie')->assertOk();
        }
        for ($request = 0; $request < 30; $request++) {
            $this->getJson('/playback/movie:969681')->assertOk()->assertJsonPath('id', '969681');
        }
        $this->getJson('/playback/movie:969681')->assertStatus(429);
        $this->getJson('/catalog?type=movie')->assertOk();
    }

    public function test_legacy_saved_series_match_via_tmdb_without_calling_tvmaze(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567']);
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->putJson('/profiles/alex/watchlist/tvmaze:42', ['title' => 'A series', 'year' => '2023',
            'type' => 'Series', 'genre' => 'Drama', 'genres' => [], 'rating' => '—', 'image' => null, 'description' => 'A series.'])->assertOk();
        Http::fake([
            'api.themoviedb.org/3/search/tv*' => Http::response(['results' => [['id' => 99, 'name' => 'A series', 'first_air_date' => '2023-01-01']]]),
            'api.themoviedb.org/3/tv/99' => Http::response(['seasons' => [
                ['season_number' => 0, 'episode_count' => 0, 'name' => 'Specials'],
                ['season_number' => 1, 'episode_count' => 10, 'name' => 'Season 1'],
            ]]),
        ]);
        $this->getJson('/playback/tvmaze:42')->assertOk()->assertJsonPath('type', 'tv')->assertJsonPath('id', '99')
            ->assertJsonCount(1, 'seasons')->assertJsonPath('seasons.0.episodes', 10)->assertDontSee('private-test-token');
        $this->getJson('/playback/tvmaze:42')->assertOk();
        Http::assertSentCount(2);
        $this->getJson('/playback/tv:99')->assertOk()->assertJsonPath('id', '99');
        Http::assertSentCount(3);
    }

    public function test_saved_wikipedia_movies_match_without_the_imported_catalog_table(): void
    {
        $id = 'wiki:'.str_repeat('a', 24);
        $this->assertFalse(Schema::hasTable('catalog_movies'));
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->putJson('/profiles/alex/watchlist/'.$id, ['title' => 'A Film', 'year' => '2023',
            'type' => 'Movies', 'genre' => 'Drama', 'genres' => [], 'rating' => '—', 'image' => null, 'description' => 'A film.'])->assertOk();
        Http::fake(['*' => Http::sequence()->push(['results' => [
            ['id' => 42, 'title' => 'A Film', 'release_date' => '2023-01-01'],
            ['id' => 43, 'title' => 'A Film', 'release_date' => '2022-01-01'],
        ]])->push(['results' => []])]);
        $this->getJson('/playback/'.$id)->assertOk()->assertJsonPath('id', '42');
        Cache::flush();
        $this->getJson('/playback/'.$id)->assertStatus(503);
        $this->getJson('/profiles/alex/watchlist')->assertJsonCount(1, 'titles')->assertJsonPath('titles.0.title', 'A Film');
        $this->getJson('/playback/wiki:'.str_repeat('b', 24))->assertStatus(503);
    }

    public function test_provider_failures_and_missing_credentials_are_sanitized(): void
    {
        Http::fake(['*' => Http::response(['error' => 'private-test-token'], 500)]);
        $this->getJson('/playback/tv:42')->assertStatus(503)->assertDontSee('private-test-token');
        config(['services.tmdb.token' => null]);
        $this->getJson('/playback/tvmaze:42')->assertStatus(503);
        $this->getJson('/playback/movie:42')->assertOk();
    }

    public function test_season_episodes_distinguish_released_future_and_unknown_dates(): void
    {
        $this->travelTo(now('UTC')->setDate(2026, 11, 2)->startOfDay());
        Http::fake(['api.themoviedb.org/3/tv/42/season/1' => Http::response(['episodes' => [
            ['episode_number' => 1, 'name' => 'Pilot', 'air_date' => '2026-10-26'],
            ['episode_number' => 2, 'name' => 'Today', 'air_date' => '2026-11-02'],
            ['episode_number' => 3, 'name' => 'Next', 'air_date' => '2026-11-03'],
            ['episode_number' => 4, 'name' => 'Unknown', 'air_date' => null],
            ['episode_number' => 5, 'air_date' => '2026-99-01'],
            ['episode_number' => -1, 'name' => 'Invalid'],
        ]])]);
        $this->getJson('/playback/tv/42/season/1')->assertOk()->assertJsonCount(5, 'episodes')
            ->assertJsonPath('released_count', 2)->assertJsonPath('episodes.0.released', true)
            ->assertJsonPath('episodes.1.released', true)->assertJsonPath('episodes.2.released', false)
            ->assertJsonPath('episodes.3.air_date', null)->assertJsonPath('episodes.4.released', false)
            ->assertDontSee('private-test-token');
        $this->travelTo(now('UTC')->addDay());
        $this->getJson('/playback/tv/42/season/1')->assertOk()->assertJsonPath('released_count', 3);
        $this->travelBack();
    }

    public function test_season_metadata_is_cached_and_invalid_requests_and_provider_failures_are_safe(): void
    {
        $failing = false;
        Http::fake(function () use (&$failing) {
            return $failing ? Http::response(['error' => 'private-test-token'], 500) : Http::response(['episodes' => []]);
        });
        $this->getJson('/playback/tv/42/season/0')->assertOk()->assertJsonPath('released_count', 0);
        $this->getJson('/playback/tv/42/season/0')->assertOk();
        Http::assertSentCount(1);
        $this->getJson('/playback/tv/42/season/1001')->assertNotFound();
        $this->getJson('/playback/tv/42/season/-1')->assertNotFound();
        $failing = true;
        $this->getJson('/playback/tv/99/season/1')->assertStatus(503)->assertDontSee('private-test-token');
        config(['services.tmdb.token' => null]);
        $this->getJson('/playback/tv/42/season/0')->assertStatus(503);
    }
}
