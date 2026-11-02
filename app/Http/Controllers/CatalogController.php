<?php

namespace App\Http\Controllers;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;
use UnexpectedValueException;

class CatalogController extends Controller
{
    private const array GENRES = [
        'movie' => ['Horror' => 27, 'Romance' => 10749, 'Sci-Fi' => 878, 'Fantasy' => 14, 'Action' => 28,
            'Adventure' => 12, 'Comedy' => 35, 'Drama' => 18, 'Thriller' => 53, 'Animation' => 16,
            'Crime' => 80, 'Mystery' => 9648, 'Family' => 10751, 'Documentary' => 99, 'History' => 36,
            'Music' => 10402, 'War' => 10752, 'Western' => 37, 'TV Movie' => 10770],
        'tv' => ['Sci-Fi & Fantasy' => 10765, 'Action & Adventure' => 10759, 'Comedy' => 35,
            'Drama' => 18, 'Animation' => 16, 'Crime' => 80, 'Mystery' => 9648, 'Family' => 10751,
            'Documentary' => 99, 'Kids' => 10762, 'News' => 10763, 'Reality' => 10764,
            'Soap' => 10766, 'Talk' => 10767, 'War & Politics' => 10768, 'Western' => 37],
    ];

    /** @return list<string> */
    public static function genreLabels(string $type = 'all'): array
    {
        if ($type === 'movie') {
            return ['All', ...array_keys(self::GENRES['movie'])];
        }
        if ($type === 'tv') {
            return ['All', 'Sci-Fi', 'Fantasy', 'Action', 'Adventure', ...array_keys(self::GENRES['tv'])];
        }
        return ['All', ...array_values(array_unique([...array_keys(self::GENRES['movie']), ...array_keys(self::GENRES['tv'])]))];
    }

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['sometimes', Rule::in(['all', 'movie', 'tv'])],
            'genre' => ['sometimes', Rule::in(self::genreLabels())],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:500'],
        ]);
        $token = trim((string) config('services.tmdb.token'));
        if ($token === '') {
            return response()->json(['source' => 'unavailable', 'results' => [], 'message' => 'The catalog is not configured yet.'], 503);
        }
        $type = $data['type'] ?? 'all';
        $genre = $data['genre'] ?? 'All';
        $query = trim($data['q'] ?? '');
        $page = (int) ($data['page'] ?? 1);
        $results = [];
        $hasMore = false;
        $unavailable = [];
        $types = $type === 'all' ? ['movie', 'tv'] : [$type];

        foreach ($types as $mediaType) {
            try {
                $catalog = $this->titles($token, $mediaType, $query, $genre, $page);
                $results = [...$results, ...$catalog['results']];
                $hasMore = $hasMore || $catalog['has_more'];
            } catch (ConnectionException|RequestException|UnexpectedValueException $exception) {
                $unavailable[] = $mediaType;
            }
        }
        $failed = count($unavailable) === count($types);

        return response()->json([
            'source' => $failed ? 'unavailable' : 'tmdb', 'results' => $results,
            'page' => $page, 'has_more' => $hasMore, 'unavailable' => $unavailable,
        ], $failed ? 503 : 200);
    }

    public function releases(): JsonResponse
    {
        $token = trim((string) config('services.tmdb.token'));
        if ($token === '') {
            return response()->json(['source' => 'unavailable', 'results' => []], 503);
        }
        try {
            $catalog = $this->titles($token, 'movie', '', 'All', 1, true);
            $today = now()->toDateString();
            $earliest = now()->subDays(90)->toDateString();
            $movies = array_values(array_filter($catalog['results'], fn (array $movie): bool =>
                preg_match('/^\d{4}-\d{2}-\d{2}$/', $movie['release_date'])
                && $movie['release_date'] <= $today && $movie['release_date'] >= $earliest));

            return response()->json(['source' => 'tmdb', 'results' => array_slice($movies, 0, 6)]);
        } catch (ConnectionException|RequestException|UnexpectedValueException $exception) {
            return response()->json(['source' => 'unavailable', 'results' => []], 503);
        }
    }

    /** @return array{results: list<array<string, mixed>>, has_more: bool} */
    private function titles(string $token, string $type, string $query, string $genre, int $page, bool $latest = false): array
    {
        $genreId = self::GENRES[$type][$genre] ?? null;
        if ($type === 'tv' && $genreId === null) {
            $genreId = match ($genre) {
                'Sci-Fi', 'Fantasy' => 10765,
                'Action', 'Adventure' => 10759,
                default => null,
            };
        }
        if ($genre !== 'All' && $genreId === null) {
            return ['results' => [], 'has_more' => false];
        }
        $key = 'tmdb.catalog.v5.'.hash('sha256', json_encode([$token, $type, $query, $genre, $page, $latest]));

        return Cache::remember($key, 300, function () use ($token, $type, $query, $genreId, $page, $latest): array {
            $parameters = ['language' => 'en-US', 'include_adult' => 'false', 'page' => $page];
            if ($query !== '') {
                $parameters['query'] = $query;
            } else {
                $parameters['sort_by'] = 'popularity.desc';
                if ($genreId !== null) {
                    $parameters['with_genres'] = $genreId;
                }
            }
            $endpoint = ($query === '' ? 'discover/' : 'search/').$type;
            if ($latest) {
                $endpoint = 'movie/now_playing';
                unset($parameters['sort_by']);
            }
            $response = Http::acceptJson()->withToken($token)
                ->withOptions(['verify' => config('services.catalog.ca_bundle')])->connectTimeout(3)->timeout(10)
                ->get('https://api.themoviedb.org/3/'.$endpoint, $parameters)->throw();
            $items = $response->json('results');
            if (! is_array($items) || ! array_is_list($items)) {
                throw new UnexpectedValueException('Invalid catalog response.');
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
                $genres = array_keys(array_filter(self::GENRES[$type], fn (int $id): bool => in_array($id, $genreIds, true)));
                $poster = $item['poster_path'] ?? null;
                $backdrop = $item['backdrop_path'] ?? null;
                $date = $item[$type === 'movie' ? 'release_date' : 'first_air_date'] ?? '';
                $results[] = [
                    'id' => $type.':'.$item['id'], 'title' => $item[$type === 'movie' ? 'title' : 'name'] ?? 'Untitled',
                    'year' => substr($date ?: 'TBA', 0, 4), 'type' => $type === 'movie' ? 'Movies' : 'Series',
                    'genre' => $genres[0] ?? ($type === 'movie' ? 'Movie' : 'Series'), 'genres' => $genres,
                    'rating' => ! empty($item['vote_count']) ? number_format((float) ($item['vote_average'] ?? 0), 1) : '—',
                    'image' => is_string($poster) && preg_match('~^/[a-zA-Z0-9._-]+$~', $poster) ? 'https://image.tmdb.org/t/p/w500'.$poster : null,
                    'backdrop' => is_string($backdrop) && preg_match('~^/[a-zA-Z0-9._-]+$~', $backdrop) ? 'https://image.tmdb.org/t/p/w1280'.$backdrop : null,
                    'release_date' => $date,
                    'description' => ($item['overview'] ?? '') ?: 'No synopsis is available for this title yet.',
                    'source_url' => 'https://www.themoviedb.org/'.$type.'/'.$item['id'],
                ];
            }

            return ['results' => $results, 'has_more' => $page < min(500, (int) $response->json('total_pages', 1))];
        });
    }
}
