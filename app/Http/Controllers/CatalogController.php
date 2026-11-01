<?php

namespace App\Http\Controllers;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;
use UnexpectedValueException;

class CatalogController extends Controller
{
    private const array MOVIE_GENRES = ['Sci-Fi' => 878, 'Adventure' => 12, 'Drama' => 18, 'Action' => 28, 'Animation' => 16, 'Thriller' => 53];

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['sometimes', Rule::in(['all', 'movie', 'tv'])],
            'genre' => ['sometimes', Rule::in(['All', 'Sci-Fi', 'Adventure', 'Drama', 'Action', 'Animation', 'Thriller'])],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:2000'],
        ]);
        $type = $data['type'] ?? 'all';
        $genre = $data['genre'] ?? 'All';
        $query = trim($data['q'] ?? '');
        $page = (int) ($data['page'] ?? 1);
        $results = [];
        $hasMore = false;
        $unavailable = [];
        $movieSource = 'wikipedia';
        $useWikipedia = true;
        $token = trim((string) config('services.tmdb.token'));

        if ($type !== 'tv' && $token !== '') {
            try {
                $catalog = $this->tmdbMovies($token, $query, $genre, $page);
                $results = $catalog['results'];
                $hasMore = $catalog['has_more'];
                $movieSource = 'tmdb';
                $useWikipedia = false;
            } catch (ConnectionException|RequestException|UnexpectedValueException $exception) {
                $unavailable[] = 'tmdb';
            }
        }

        if ($type !== 'tv' && $useWikipedia) {
            $movies = DB::table('catalog_movies');
            if ($query !== '') {
                $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($query));
                $movies->whereRaw("LOWER(title) LIKE ? ESCAPE '!'", ['%'.$escaped.'%']);
            }
            if ($genre !== 'All') {
                $movies->whereJsonContains('genres', $genre);
            }
            $items = $movies->orderByDesc('year')->orderBy('title')->orderBy('id')->offset(($page - 1) * 24)->limit(25)->get();
            $hasMore = $items->count() > 24;
            $results = $items->take(24)->map(fn (object $item): array => json_decode($item->details, true))->all();
            if (! DB::table('catalog_movies')->exists()) {
                $unavailable[] = 'wikipedia';
            }
        }

        if ($type !== 'movie') {
            try {
                $indexPage = intdiv($page - 1, 10);
                $key = 'tvmaze.catalog.v1.'.hash('sha256', json_encode([$query, $query === '' ? $indexPage : 0]));
                $shows = Cache::remember($key, 3600, function () use ($query, $indexPage): array {
                    $response = Http::acceptJson()->withOptions(['verify' => config('services.catalog.ca_bundle')])
                        ->withUserAgent('TheVoid/1.0')->connectTimeout(3)->timeout(10)
                        ->get('https://api.tvmaze.com/'.($query === '' ? 'shows' : 'search/shows'), $query === '' ? ['page' => $indexPage] : ['q' => $query]);
                    if ($query === '' && $response->status() === 404) {
                        return [];
                    }
                    $items = $response->throw()->json();
                    if (! is_array($items) || ! array_is_list($items)) {
                        throw new UnexpectedValueException('Invalid TVmaze response.');
                    }
                    $shows = [];
                    foreach ($items as $item) {
                        $show = $query === '' ? $item : ($item['show'] ?? null);
                        if (is_array($show) && isset($show['id'], $show['name'])) {
                            $shows[] = $this->normalizeShow($show);
                        }
                    }

                    return $shows;
                });
                $slice = array_slice($shows, $query === '' ? (($page - 1) % 10) * 25 : ($page - 1) * 25, 25);
                $filtered = array_values(array_filter($slice, fn (array $show): bool => $genre === 'All' || in_array($genre, $show['genres'], true)));
                $results = [...$results, ...$filtered];
                $hasMore = $hasMore || ($query === '' ? count($shows) > 0 : count($shows) > $page * 25);
            } catch (ConnectionException|RequestException|UnexpectedValueException $exception) {
                $unavailable[] = 'tvmaze';
            }
        }

        $failed = match ($type) {
            'movie' => in_array('wikipedia', $unavailable, true),
            'tv' => in_array('tvmaze', $unavailable, true),
            default => in_array('wikipedia', $unavailable, true) && in_array('tvmaze', $unavailable, true),
        };

        return response()->json([
            'source' => $failed ? 'unavailable' : 'open', 'results' => $results,
            'page' => $page, 'has_more' => $page < 2000 && $hasMore, 'unavailable' => $unavailable,
            'movie_source' => $movieSource,
        ], $failed ? 503 : 200);
    }

    /** @return array{results: list<array<string, mixed>>, has_more: bool} */
    private function tmdbMovies(string $token, string $query, string $genre, int $page): array
    {
        if ($page > 500) {
            return ['results' => [], 'has_more' => false];
        }
        $key = 'tmdb.movies.v2.'.hash('sha256', json_encode([$token, $query, $genre, $page]));

        return Cache::remember($key, 300, function () use ($token, $query, $genre, $page): array {
            $parameters = ['language' => 'en-US', 'include_adult' => 'false', 'page' => $page];
            $genreId = self::MOVIE_GENRES[$genre] ?? null;
            if ($query !== '') {
                $parameters['query'] = $query;
            } else {
                $parameters['sort_by'] = 'popularity.desc';
                if ($genreId !== null) {
                    $parameters['with_genres'] = $genreId;
                }
            }
            $response = Http::acceptJson()->withToken($token)
                ->withOptions(['verify' => config('services.catalog.ca_bundle')])->connectTimeout(3)->timeout(10)
                ->get('https://api.themoviedb.org/3/'.($query === '' ? 'discover/movie' : 'search/movie'), $parameters)->throw();
            $items = $response->json('results');
            if (! is_array($items) || ! array_is_list($items)) {
                throw new UnexpectedValueException('Invalid movie response.');
            }
            $results = [];
            foreach ($items as $item) {
                if (! is_array($item) || empty($item['id']) || ($item['adult'] ?? false)) {
                    continue;
                }
                $genreIds = $item['genre_ids'] ?? [];
                if ($genreId !== null && ! in_array($genreId, $genreIds, true)) {
                    continue;
                }
                $genres = array_keys(array_filter(self::MOVIE_GENRES, fn (int $id): bool => in_array($id, $genreIds, true)));
                $poster = $item['poster_path'] ?? null;
                $results[] = [
                    'id' => 'movie:'.$item['id'], 'title' => $item['title'] ?? 'Untitled',
                    'year' => substr(($item['release_date'] ?? '') ?: 'TBA', 0, 4), 'type' => 'Movies',
                    'genre' => $genres[0] ?? 'Movie', 'genres' => $genres,
                    'rating' => ! empty($item['vote_count']) ? number_format((float) ($item['vote_average'] ?? 0), 1) : '—',
                    'image' => is_string($poster) && preg_match('~^/[a-zA-Z0-9._-]+$~', $poster) ? 'https://image.tmdb.org/t/p/w500'.$poster : null,
                    'description' => ($item['overview'] ?? '') ?: 'No synopsis is available for this title yet.',
                    'source_url' => 'https://www.themoviedb.org/movie/'.$item['id'],
                ];
            }

            return ['results' => $results, 'has_more' => $page < min(500, (int) $response->json('total_pages', 1))];
        });
    }

    /**
     * @param array<string, mixed> $show
     * @return array<string, mixed>
     */
    private function normalizeShow(array $show): array
    {
        $genres = array_values(array_unique(array_map(fn (string $genre): string => $genre === 'Science-Fiction' ? 'Sci-Fi' : $genre, $show['genres'] ?? [])));
        $image = $show['image']['medium'] ?? null;

        return [
            'id' => 'tvmaze:'.$show['id'], 'title' => $show['name'],
            'year' => substr($show['premiered'] ?? 'TBA', 0, 4), 'type' => 'Series',
            'genre' => $genres[0] ?? 'Series', 'genres' => $genres,
            'rating' => isset($show['rating']['average']) ? number_format((float) $show['rating']['average'], 1) : '—',
            'image' => is_string($image) && preg_match('~^https://static\.tvmaze\.com/[^\s]+$~', $image) ? $image : null,
            'description' => html_entity_decode(strip_tags($show['summary'] ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8') ?: 'No synopsis is available for this title yet.',
            'source_url' => 'https://www.tvmaze.com/shows/'.$show['id'],
        ];
    }
}
