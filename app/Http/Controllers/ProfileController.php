<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['profiles' => DB::table('viewer_profiles')->whereNull('deleted_at')->orderBy('created_at')->orderBy('id')->get(['id', 'name', 'avatar']),
            'archived_ids' => DB::table('viewer_profiles')->whereNotNull('deleted_at')->pluck('id')]);
    }

    public function store(Request $request, string $profile): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:24'],
            'avatar' => ['required', Rule::in(['violet', 'moon', 'star', 'orbit'])],
        ]);

        return DB::transaction(function () use ($data, $profile): JsonResponse {
            $profiles = DB::table('viewer_profiles')->lockForUpdate()->get();
            $existing = $profiles->firstWhere('id', $profile);
            abort_if($existing?->deleted_at !== null, 404);
            $nameKey = mb_strtolower($data['name']);

            if ($profiles->contains(fn (object $item): bool => $item->id !== $profile && $item->name_key === $nameKey)) {
                throw ValidationException::withMessages(['name' => 'That name is already in use.']);
            }
            if (! $existing && $profiles->whereNull('deleted_at')->count() >= 6) {
                throw ValidationException::withMessages(['name' => 'You can have up to 6 profiles. Edit an existing profile instead.']);
            }

            DB::table('viewer_profiles')->updateOrInsert(['id' => $profile], [
                ...$data, 'name_key' => $nameKey,
                'created_at' => $existing?->created_at ?? now(), 'updated_at' => now(),
            ]);

            return response()->json(['profile' => ['id' => $profile, ...$data]], $existing ? 200 : 201);
        }, 3);
    }

    public function archive(string $profile): JsonResponse
    {
        return DB::transaction(function () use ($profile): JsonResponse {
            $profiles = DB::table('viewer_profiles')->lockForUpdate()->get();
            $existing = $profiles->firstWhere('id', $profile);
            abort_unless($existing, 404);
            if ($existing->deleted_at !== null) {
                return response()->json(['archived' => true]);
            }
            if ($profiles->whereNull('deleted_at')->count() <= 1) {
                throw ValidationException::withMessages(['profile' => 'Keep at least one profile. Add another profile before archiving this one.']);
            }
            DB::table('viewer_profiles')->where('id', $profile)->update(['deleted_at' => now(), 'updated_at' => now()]);

            return response()->json(['archived' => true]);
        }, 3);
    }

    public function watchlist(string $profile): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->exists(), 404);
        $titles = DB::table('watchlist_entries')->where('profile_id', $profile)->orderBy('created_at')->orderBy('id')
            ->pluck('details')->map(fn (string $details): array => json_decode($details, true));

        return response()->json(['titles' => $titles]);
    }

    public function saveTitle(Request $request, string $profile, string $title): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->exists(), 404);
        $data = $this->titleData($request, $title);

        DB::table('watchlist_entries')->upsert([
            'profile_id' => $profile, 'title_key' => $title,
            'details' => json_encode(['id' => $title, ...$data]),
            'created_at' => now(), 'updated_at' => now(),
        ], ['profile_id', 'title_key'], ['details', 'updated_at']);

        return response()->json(['saved' => true]);
    }

    public function removeTitle(string $profile, string $title): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->exists(), 404);
        DB::table('watchlist_entries')->where('profile_id', $profile)->where('title_key', $title)->delete();

        return response()->json(['saved' => false]);
    }

    public function history(string $profile): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->exists(), 404);
        $entries = DB::table('watch_history')->where('profile_id', $profile)->orderByDesc('watched_at')->orderByDesc('id')
            ->limit(100)->get()->map(fn (object $entry): array => $this->historyEntry($entry));

        return response()->json(['entries' => $entries]);
    }

    public function recordWatch(Request $request, string $profile, string $title): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->exists(), 404);
        $details = $this->titleData($request, $title);
        $progress = $request->validate([
            'position' => ['required', 'integer', 'min:5', 'max:604800'],
            'duration' => ['required', 'integer', 'gte:position', 'max:604800'],
            'season' => ['nullable', 'required_if:type,Series', 'prohibited_if:type,Movies', 'integer', 'min:0', 'max:1000'],
            'episode' => ['nullable', 'required_if:type,Series', 'prohibited_if:type,Movies', 'integer', 'min:1', 'max:5000'],
            'finished' => ['required', 'boolean'],
        ]);

        return DB::transaction(function () use ($profile, $title, $details, $progress): JsonResponse {
            abort_unless(DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->lockForUpdate()->first(), 404);
            DB::table('watch_history')->upsert([
                'profile_id' => $profile, 'title_key' => $title, 'details' => json_encode(['id' => $title, ...$details]),
                ...$progress, 'season' => $progress['season'] ?? null, 'episode' => $progress['episode'] ?? null,
                'watched_at' => now()->format('Y-m-d H:i:s.u'),
            ], ['profile_id', 'title_key'], ['details', 'position', 'duration', 'season', 'episode', 'finished', 'watched_at']);
            $oldIds = DB::table('watch_history')->where('profile_id', $profile)->where('title_key', '!=', $title)
                ->orderByDesc('watched_at')->orderByDesc('id')->pluck('id')->slice(99);
            if ($oldIds->isNotEmpty()) {
                DB::table('watch_history')->whereIn('id', $oldIds)->delete();
            }
            $entry = DB::table('watch_history')->where('profile_id', $profile)->where('title_key', $title)->first();

            return response()->json(['entry' => $this->historyEntry($entry)]);
        }, 3);
    }

    /** @return array<string, mixed> */
    private function historyEntry(object $entry): array
    {
        return [...json_decode($entry->details, true), 'position' => (int) $entry->position, 'duration' => (int) $entry->duration,
            'season' => $entry->season === null ? null : (int) $entry->season,
            'episode' => $entry->episode === null ? null : (int) $entry->episode, 'finished' => (bool) $entry->finished,
            'watched_at' => \Illuminate\Support\Carbon::parse($entry->watched_at)->toIso8601String()];
    }
    /** @return array<string, mixed> */
    private function titleData(Request $request, string $title): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:500'],
            'year' => ['required', 'string', 'max:8'],
            'type' => ['required', Rule::in(['Movies', 'Series'])],
            'genre' => ['required', 'string', 'max:50'],
            'genres' => ['present', 'array', 'max:20'],
            'genres.*' => ['string', 'max:50'],
            'rating' => ['required', 'string', 'max:8'],
            'image' => ['nullable', 'string', 'max:1000', 'regex:~^https://(image\.tmdb\.org|lumiere-a\.akamaihd\.net|upload\.wikimedia\.org|static\.tvmaze\.com)/[^\s]+$~'],
            'description' => ['required', 'string', 'max:10000'],
            'source_url' => ['nullable', 'string', 'max:1000', 'regex:~^https://(en\.wikipedia\.org/wiki/|www\.tvmaze\.com/shows/|www\.themoviedb\.org/(movie|tv)/)[^\s]+$~'],
        ]);

        if (($data['type'] === 'Movies') !== (str_starts_with($title, 'movie:') || str_starts_with($title, 'wiki:'))) {
            throw ValidationException::withMessages(['type' => 'The title type does not match its identifier.']);
        }

        return $data;
    }

}
