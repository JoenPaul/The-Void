<?php

namespace App\Http\Controllers;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use UnexpectedValueException;

class PlaybackController extends Controller
{
    public function episodes(string $series, string $season): JsonResponse
    {
        abort_if((int) $season > 1000, 404);
        $token = trim((string) config('services.tmdb.token'));
        if ($token === '') {
            return response()->json(['message' => 'Episode information is temporarily unavailable.'], 503);
        }
        try {
            $data = Cache::remember('playback.episodes.v1.'.hash('sha256', $series.':'.$season.$token), 300,
                fn (): array => $this->tmdb('tv/'.$series.'/season/'.$season, $token));
            if (! is_array($data['episodes'] ?? null) || ! array_is_list($data['episodes'])) {
                throw new UnexpectedValueException('Missing episodes.');
            }
            $today = now('UTC')->toDateString();
            $episodes = [];
            foreach ($data['episodes'] as $episode) {
                if (! is_array($episode) || ! is_int($episode['episode_number'] ?? null)
                    || $episode['episode_number'] < 1 || $episode['episode_number'] > 5000) {
                    continue;
                }
                $date = $episode['air_date'] ?? null;
                $hasDate = is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)
                    && checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4));
                $episodes[$episode['episode_number']] = [
                    'number' => $episode['episode_number'], 'name' => ($episode['name'] ?? '') ?: 'Episode '.$episode['episode_number'],
                    'air_date' => $hasDate ? $date : null, 'released' => $hasDate && $date <= $today,
                ];
            }
            ksort($episodes);

            return response()->json(['season' => (int) $season, 'episodes' => array_values($episodes),
                'released_count' => count(array_filter($episodes, fn (array $episode): bool => $episode['released']))]);
        } catch (ConnectionException|RequestException|UnexpectedValueException $exception) {
            return response()->json(['message' => 'Episode information is temporarily unavailable.'], 503);
        }
    }

    public function __invoke(string $title): JsonResponse
    {
        [$provider, $id] = explode(':', $title, 2);
        if ($provider === 'movie') {
            return response()->json(['type' => 'movie', 'id' => $id, 'seasons' => []]);
        }
        $token = trim((string) config('services.tmdb.token'));
        if ($token === '') {
            return response()->json(['message' => 'Playback matching is temporarily unavailable.'], 503);
        }
        try {
            $data = Cache::remember('playback.v3.'.hash('sha256', $title.$token), 3600, function () use ($provider, $id, $token): array {
                if ($provider === 'wiki') {
                    $snapshot = DB::table('watchlist_entries')->where('title_key', 'wiki:'.$id)->value('details');
                    $movie = $snapshot ? json_decode($snapshot, true) : null;
                    if (! is_array($movie) || empty($movie['title']) || empty($movie['year'])) {
                        throw new UnexpectedValueException('No saved movie metadata.');
                    }
                    $matches = $this->tmdb('search/movie', $token, ['query' => $movie['title'], 'year' => $movie['year'], 'include_adult' => 'false']);
                    $matches = array_values(array_filter($matches['results'] ?? [], fn (array $item): bool =>
                        mb_strtolower($item['title'] ?? '') === mb_strtolower($movie['title'])
                        && substr($item['release_date'] ?? '', 0, 4) === (string) $movie['year'] && ! ($item['adult'] ?? false)));
                    if (count($matches) !== 1 || empty($matches[0]['id'])) {
                        throw new UnexpectedValueException('No unambiguous movie match.');
                    }

                    return ['type' => 'movie', 'id' => (string) $matches[0]['id'], 'seasons' => []];
                }
                if ($provider === 'tvmaze') {
                    $snapshot = DB::table('watchlist_entries')->where('title_key', 'tvmaze:'.$id)->value('details');
                    $saved = $snapshot ? json_decode($snapshot, true) : null;
                    if (! is_array($saved) || empty($saved['title'])) {
                        throw new UnexpectedValueException('No saved series metadata.');
                    }
                    $match = $this->tmdb('search/tv', $token, ['query' => $saved['title'], 'include_adult' => 'false']);
                    $matches = array_values(array_filter($match['results'] ?? [], fn (array $item): bool =>
                        mb_strtolower($item['name'] ?? '') === mb_strtolower($saved['title'])
                        && substr($item['first_air_date'] ?? '', 0, 4) === (string) $saved['year'] && ! ($item['adult'] ?? false)));
                    if (count($matches) !== 1 || empty($matches[0]['id'])) {
                        throw new UnexpectedValueException('No unambiguous series match.');
                    }
                    $id = (string) $matches[0]['id'];
                }
                $show = $this->tmdb('tv/'.$id, $token);
                if (! is_array($show['seasons'] ?? null)) {
                    throw new UnexpectedValueException('Missing seasons.');
                }
                $seasons = [];
                foreach ($show['seasons'] as $season) {
                    if (isset($season['season_number'], $season['episode_count']) && $season['episode_count'] > 0) {
                        $seasons[] = ['number' => (int) $season['season_number'], 'name' => $season['name'] ?? 'Season '.$season['season_number'], 'episodes' => (int) $season['episode_count']];
                    }
                }
                if ($seasons === []) {
                    throw new UnexpectedValueException('No episodes.');
                }

                return ['type' => 'tv', 'id' => $id, 'seasons' => $seasons];
            });

            return response()->json($data);
        } catch (ConnectionException|RequestException|UnexpectedValueException $exception) {
            return response()->json(['message' => 'We couldn’t match this title for playback. Please try again later.'], 503);
        }
    }

    /**
     * @param array<string, mixed> $parameters
     * @return array<string, mixed>
     */
    private function tmdb(string $path, string $token, array $parameters = []): array
    {
        $data = Http::acceptJson()->withToken($token)->withOptions(['verify' => config('services.catalog.ca_bundle')])
            ->connectTimeout(3)->timeout(10)->get('https://api.themoviedb.org/3/'.$path, $parameters)->throw()->json();
        if (! is_array($data)) {
            throw new UnexpectedValueException('Invalid metadata response.');
        }

        return $data;
    }
}
