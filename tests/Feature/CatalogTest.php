<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CatalogTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.tmdb.token' => 'private-test-token']);
        Cache::flush();
        Http::preventStrayRequests();
    }

    public function test_movies_and_series_come_only_from_tmdb_with_distinct_ids(): void
    {
        Http::fake([
            'api.themoviedb.org/3/discover/movie*' => Http::response(['results' => [$this->movie()], 'total_pages' => 2]),
            'api.themoviedb.org/3/discover/tv*' => Http::response(['results' => [
                ['id' => 42, 'name' => 'A series', 'first_air_date' => '2026-01-01', 'genre_ids' => [10765]],
            ], 'total_pages' => 1]),
        ]);
        $this->getJson('/catalog')->assertOk()->assertJsonPath('source', 'tmdb')->assertJsonCount(2, 'results')
            ->assertJsonPath('results.0.id', 'movie:42')->assertJsonPath('results.1.id', 'tv:42')
            ->assertJsonPath('results.1.source_url', 'https://www.themoviedb.org/tv/42')
            ->assertJsonPath('results.1.rating', '—')->assertJsonPath('has_more', true)
            ->assertDontSee('private-test-token');
        Http::assertSentCount(2);
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => $request->hasHeader('Authorization', 'Bearer private-test-token')
            && $request['include_adult'] === 'false');
        $this->get('/')->assertOk()->assertDontSee('private-test-token');
    }

    public function test_identical_requests_are_cached_but_media_types_and_pages_are_separate(): void
    {
        Http::fake(['*' => Http::response(['results' => [], 'total_pages' => 5])]);
        $this->getJson('/catalog?type=movie')->assertOk();
        $this->getJson('/catalog?type=movie')->assertOk();
        Http::assertSentCount(1);
        $this->getJson('/catalog?type=tv')->assertOk();
        $this->getJson('/catalog?type=movie&page=2')->assertOk();
        Http::assertSentCount(3);
    }

    public function test_search_filters_genres_adult_titles_and_unsafe_posters(): void
    {
        Http::fake(['*' => Http::response(['results' => [
            $this->movie(), [...$this->movie(), 'id' => 43, 'adult' => true],
            [...$this->movie(), 'id' => 44, 'genre_ids' => [18]],
            [...$this->movie(), 'id' => 45, 'poster_path' => '//evil.example/a.jpg'],
        ], 'total_pages' => 1000])]);
        $this->getJson('/catalog?type=movie&q=Space&genre=Sci-Fi&page=500')->assertOk()
            ->assertJsonCount(2, 'results')->assertJsonPath('results.1.image', null)->assertJsonPath('has_more', false);
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => str_contains($request->url(), '/search/movie') && $request['query'] === 'Space');
    }

    public function test_tv_discovery_maps_genres_to_tmdb_tv_ids(): void
    {
        Http::fake(['*' => Http::response(['results' => [], 'total_pages' => 1])]);
        $this->getJson('/catalog?type=tv&genre=Action')->assertOk();
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => str_contains($request->url(), '/discover/tv') && $request['with_genres'] === 10759);
    }

    public function test_new_movie_genres_and_tv_categories_are_classified_and_filterable(): void
    {
        Http::fake([
            'api.themoviedb.org/3/discover/movie*' => Http::response(['results' => [
                [...$this->movie(), 'genre_ids' => [27, 10749, 14]],
            ], 'total_pages' => 1]),
            'api.themoviedb.org/3/discover/tv*' => Http::response(['results' => [
                ['id' => 88, 'name' => 'A comedy', 'genre_ids' => [35, 10765]],
            ], 'total_pages' => 1]),
        ]);
        $this->getJson('/catalog?type=movie&genre=Horror')->assertOk()
            ->assertJsonPath('results.0.genres', ['Horror', 'Romance', 'Fantasy']);
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => $request['with_genres'] === 27);
        $this->getJson('/catalog?type=movie&genre=Romance')->assertOk()->assertJsonCount(1, 'results');
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => $request['with_genres'] === 10749);
        $this->getJson('/catalog?type=tv&genre=Fantasy')->assertOk()
            ->assertJsonPath('results.0.genres', ['Sci-Fi & Fantasy', 'Comedy']);
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => $request['with_genres'] === 10765);
        $this->getJson('/catalog?type=tv&genre=Horror')->assertOk()->assertJsonCount(0, 'results');
        Http::assertSentCount(3);
    }

    public function test_partial_failure_keeps_the_other_tmdb_results_and_failed_requests_can_be_retried(): void
    {
        Http::fake([
            'api.themoviedb.org/3/discover/movie*' => Http::response(['results' => [$this->movie()], 'total_pages' => 1]),
            'api.themoviedb.org/3/discover/tv*' => Http::sequence()->push(['error' => 'private-test-token'], 429)->push(['results' => []]),
        ]);
        $this->getJson('/catalog')->assertOk()->assertJsonCount(1, 'results')->assertJsonPath('unavailable.0', 'tv')
            ->assertDontSee('private-test-token');
        $this->getJson('/catalog')->assertOk()->assertJsonPath('unavailable', []);
        Http::assertSentCount(3);
    }

    public function test_total_failure_does_not_fall_back_to_another_provider(): void
    {
        Http::fake(['*' => Http::failedConnection()]);
        $this->getJson('/catalog')->assertStatus(503)->assertJsonPath('source', 'unavailable')->assertJsonPath('results', []);
        Http::assertSentCount(2);
    }

    public function test_missing_token_and_invalid_inputs_make_no_requests(): void
    {
        config(['services.tmdb.token' => null]);
        $this->getJson('/catalog')->assertStatus(503)->assertJsonPath('results', []);
        $this->getJson('/catalog?type=person&genre=unknown&page=501&q='.str_repeat('a', 101))
            ->assertUnprocessable()->assertJsonValidationErrors(['type', 'genre', 'page', 'q']);
        Http::assertNothingSent();
    }

    public function test_malformed_response_is_not_an_empty_success(): void
    {
        Http::fake(['*' => Http::response(['unexpected' => true])]);
        $this->getJson('/catalog?type=movie')->assertStatus(503);
    }

    public function test_release_carousel_uses_now_playing_and_excludes_old_future_and_adult_movies(): void
    {
        $this->travelTo(\Illuminate\Support\Carbon::parse('2026-11-02 12:00:00'));
        Http::fake(['api.themoviedb.org/3/movie/now_playing*' => Http::response(['results' => [
            [...$this->movie(), 'release_date' => '2026-10-20', 'backdrop_path' => '/backdrop.jpg'],
            [...$this->movie(), 'id' => 43, 'release_date' => '2026-11-03'],
            [...$this->movie(), 'id' => 44, 'release_date' => '2023-01-01'],
            [...$this->movie(), 'id' => 45, 'release_date' => '2026-10-20', 'adult' => true],
        ]])]);
        $this->getJson('/releases')->assertOk()->assertJsonCount(1, 'results')
            ->assertJsonPath('results.0.release_date', '2026-10-20')
            ->assertJsonPath('results.0.backdrop', 'https://image.tmdb.org/t/p/w1280/backdrop.jpg')
            ->assertDontSee('private-test-token');
        $this->getJson('/releases')->assertOk();
        Http::assertSentCount(1);
    }

    public function test_failed_release_feed_is_retryable_without_a_static_movie_fallback(): void
    {
        Http::fake(['*' => Http::sequence()->push([], 503)->push(['results' => []])]);
        $this->getJson('/releases')->assertStatus(503)->assertJsonPath('results', []);
        $this->getJson('/releases')->assertOk()->assertJsonPath('results', []);
    }

    /** @return array<string, mixed> */
    private function movie(): array
    {
        return ['id' => 42, 'title' => 'Space', 'release_date' => '2026-01-01', 'genre_ids' => [878],
            'vote_count' => 10, 'vote_average' => 8.2, 'poster_path' => '/poster.jpg', 'overview' => 'A story.'];
    }
}
