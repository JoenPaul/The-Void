<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CatalogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.tmdb.token' => null]);
        Cache::flush();
        Http::preventStrayRequests();
    }

    public function test_wikipedia_import_is_repeatable_and_movies_search_without_external_requests(): void
    {
        Http::fake(['raw.githubusercontent.com/*' => Http::response([
            ['title' => 'Space', 'year' => 2023, 'genres' => ['Science Fiction'], 'href' => 'Space_(film)',
                'extract' => 'A space adventure.', 'thumbnail' => 'https://upload.wikimedia.org/poster.jpg'],
        ])]);
        $this->artisan('catalog:import-wikipedia')->assertSuccessful();
        $this->artisan('catalog:import-wikipedia')->assertSuccessful();
        $this->assertDatabaseCount('catalog_movies', 1);
        Http::assertSentCount(26);
        $this->getJson('/catalog?type=movie&q=SPACE&genre=Sci-Fi')->assertOk()
            ->assertJsonCount(1, 'results')->assertJsonPath('source', 'open')
            ->assertJsonPath('results.0.rating', '—')
            ->assertJsonPath('results.0.source_url', 'https://en.wikipedia.org/wiki/Space_%28film%29');
        $this->getJson('/catalog?type=movie&q=%25')->assertOk()->assertJsonCount(0, 'results');
        Http::assertSentCount(26);
    }

    public function test_movies_are_filtered_before_pagination(): void
    {
        foreach (range(1, 27) as $number) {
            $this->movie($number, $number === 27 ? 'Drama' : 'Sci-Fi');
        }
        $this->getJson('/catalog?type=movie&genre=Sci-Fi')->assertOk()->assertJsonCount(24, 'results')->assertJsonPath('has_more', true);
        $this->getJson('/catalog?type=movie&genre=Sci-Fi&page=2')->assertOk()->assertJsonCount(2, 'results')->assertJsonPath('has_more', false);
        Http::assertNothingSent();
    }

    public function test_tvmaze_normalizes_html_images_ratings_and_caches_index_pages(): void
    {
        Http::fake(['api.tvmaze.com/shows*' => Http::response(array_map(fn (int $id): array => [
            'id' => $id, 'name' => 'Series '.$id, 'genres' => ['Science-Fiction'],
            'summary' => '<p>A &amp; B</p>', 'premiered' => null, 'image' => ['medium' => 'https://static.tvmaze.com/poster.jpg'],
        ], range(1, 30)))]);
        $this->getJson('/catalog?type=tv')->assertOk()->assertJsonCount(25, 'results')
            ->assertJsonPath('results.0.id', 'tvmaze:1')->assertJsonPath('results.0.description', 'A & B')
            ->assertJsonPath('results.0.genre', 'Sci-Fi')->assertJsonPath('results.0.year', 'TBA')
            ->assertJsonPath('results.0.rating', '—')->assertJsonPath('has_more', true);
        $this->getJson('/catalog?type=tv&page=2')->assertOk()->assertJsonCount(5, 'results')->assertJsonPath('results.0.id', 'tvmaze:26');
        Http::assertSentCount(1);
    }

    public function test_tvmaze_search_applies_genres_and_ends_pagination(): void
    {
        Http::fake(['api.tvmaze.com/search/shows*' => Http::response([
            ['show' => ['id' => 1, 'name' => 'Space', 'genres' => ['Science-Fiction'], 'image' => ['medium' => 'https://evil.example/a.jpg']]],
            ['show' => ['id' => 2, 'name' => 'Drama', 'genres' => ['Drama']]],
        ])]);
        $this->getJson('/catalog?type=tv&q=Space&genre=Sci-Fi')->assertOk()->assertJsonCount(1, 'results')
            ->assertJsonPath('results.0.image', null)->assertJsonPath('has_more', false);
        $this->getJson('/catalog?type=tv&q=Space&page=2')->assertOk()->assertJsonCount(0, 'results');
        Http::assertSentCount(1);
    }

    public function test_a_series_failure_keeps_wikipedia_results_and_can_be_retried(): void
    {
        $this->movie(1);
        Http::fake(['*' => Http::sequence()->push(['error' => 'private server details'], 429)->push([])]);
        $this->getJson('/catalog')->assertOk()->assertJsonCount(1, 'results')
            ->assertJsonPath('unavailable.0', 'tvmaze')->assertDontSee('private server details');
        $this->getJson('/catalog')->assertOk()->assertJsonPath('unavailable', []);
    }

    public function test_malformed_or_unreachable_upstream_is_retryable(): void
    {
        Http::fake(['*' => Http::response(['unexpected' => true])]);
        $this->getJson('/catalog?type=tv')->assertStatus(503);
        Http::fake(['*' => Http::failedConnection()]);
        $this->getJson('/catalog?type=tv')->assertStatus(503)->assertJsonPath('source', 'unavailable');
    }

    public function test_empty_movie_import_and_invalid_inputs_are_explicit(): void
    {
        $this->getJson('/catalog?type=movie')->assertStatus(503)->assertJsonPath('unavailable.0', 'wikipedia');
        $this->getJson('/catalog?type=person&genre=unknown&page=2001&q='.str_repeat('a', 101))
            ->assertUnprocessable()->assertJsonValidationErrors(['type', 'genre', 'page', 'q']);
        Http::assertNothingSent();
    }

    public function test_tvmaze_end_of_index_is_an_empty_success(): void
    {
        Http::fake(['*' => Http::response([], 404)]);
        $this->getJson('/catalog?type=tv&page=11')->assertOk()->assertJsonCount(0, 'results')->assertJsonPath('has_more', false);
    }

    public function test_tmdb_uses_private_server_auth_and_caches_movie_results(): void
    {
        config(['services.tmdb.token' => 'test-private-token']);
        Http::fake(['api.themoviedb.org/3/discover/movie*' => Http::response(['results' => [
            ['id' => 42, 'title' => 'A current movie', 'release_date' => '2026-10-01', 'genre_ids' => [878],
                'poster_path' => '/poster.jpg', 'overview' => 'A story.', 'vote_count' => 10, 'vote_average' => 8.2],
            ['id' => 43, 'adult' => true],
        ], 'total_pages' => 3])]);
        $this->getJson('/catalog?type=movie')->assertOk()->assertJsonPath('movie_source', 'tmdb')
            ->assertJsonCount(1, 'results')->assertJsonPath('results.0.id', 'movie:42')
            ->assertJsonPath('results.0.year', '2026')->assertJsonPath('results.0.rating', '8.2')
            ->assertJsonPath('results.0.image', 'https://image.tmdb.org/t/p/w500/poster.jpg')
            ->assertJsonPath('has_more', true)->assertDontSee('test-private-token');
        $this->getJson('/catalog?type=movie')->assertOk();
        Http::assertSentCount(1);
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => $request->hasHeader('Authorization', 'Bearer test-private-token')
            && $request['include_adult'] === 'false');
        $this->get('/')->assertOk()->assertDontSee('test-private-token');
    }

    public function test_tmdb_failure_preserves_wikipedia_and_can_be_retried(): void
    {
        config(['services.tmdb.token' => 'test-private-token']);
        $this->movie(1);
        Http::fake(['*' => Http::sequence()->push(['error' => 'test-private-token'], 401)
            ->push(['results' => [], 'total_pages' => 0])]);
        $this->getJson('/catalog?type=movie')->assertOk()->assertJsonPath('movie_source', 'wikipedia')
            ->assertJsonCount(1, 'results')->assertJsonPath('unavailable.0', 'tmdb')->assertDontSee('test-private-token');
        $this->getJson('/catalog?type=movie')->assertOk()->assertJsonPath('movie_source', 'tmdb')->assertJsonPath('unavailable', []);
    }

    public function test_tmdb_search_filters_genres_and_stops_at_the_provider_page_limit(): void
    {
        config(['services.tmdb.token' => 'test-private-token']);
        Http::fake(['*' => Http::response(['results' => [
            ['id' => 1, 'title' => 'Space', 'genre_ids' => [878]],
            ['id' => 2, 'title' => 'Drama', 'genre_ids' => [18]],
        ], 'total_pages' => 1000])]);
        $this->getJson('/catalog?type=movie&q=Space&genre=Sci-Fi&page=500')->assertOk()
            ->assertJsonCount(1, 'results')->assertJsonPath('results.0.rating', '—')->assertJsonPath('has_more', false);
        Http::assertSent(fn (\Illuminate\Http\Client\Request $request): bool => str_contains($request->url(), '/search/movie') && $request['query'] === 'Space');
        $this->getJson('/catalog?type=movie&page=501')->assertOk()->assertJsonCount(0, 'results')->assertJsonPath('has_more', false);
        Http::assertSentCount(1);
    }

    private function movie(int $number, string $genre = 'Sci-Fi'): void
    {
        $details = ['id' => 'wiki:'.str_pad(dechex($number), 24, '0', STR_PAD_LEFT), 'title' => 'Movie '.$number,
            'year' => '2023', 'type' => 'Movies', 'genres' => [$genre], 'genre' => $genre, 'description' => 'A movie.', 'rating' => '—', 'image' => null];
        DB::table('catalog_movies')->insert(['id' => $details['id'], 'title' => $details['title'], 'year' => 2023,
            'genres' => json_encode([$genre]), 'details' => json_encode($details)]);
    }
}
