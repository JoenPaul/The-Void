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
        return response()->json(['profiles' => DB::table('viewer_profiles')->orderBy('created_at')->orderBy('id')->get(['id', 'name', 'avatar'])]);
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
            $nameKey = mb_strtolower($data['name']);

            if ($profiles->contains(fn (object $item): bool => $item->id !== $profile && $item->name_key === $nameKey)) {
                throw ValidationException::withMessages(['name' => 'That name is already in use.']);
            }
            if (! $existing && $profiles->count() >= 6) {
                throw ValidationException::withMessages(['name' => 'You can have up to 6 profiles. Edit an existing profile instead.']);
            }

            DB::table('viewer_profiles')->updateOrInsert(['id' => $profile], [
                ...$data, 'name_key' => $nameKey,
                'created_at' => $existing?->created_at ?? now(), 'updated_at' => now(),
            ]);

            return response()->json(['profile' => ['id' => $profile, ...$data]], $existing ? 200 : 201);
        }, 3);
    }

    public function watchlist(string $profile): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->exists(), 404);
        $titles = DB::table('watchlist_entries')->where('profile_id', $profile)->orderBy('created_at')->orderBy('id')
            ->pluck('details')->map(fn (string $details): array => json_decode($details, true));

        return response()->json(['titles' => $titles]);
    }

    public function saveTitle(Request $request, string $profile, string $title): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->exists(), 404);
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
            'source_url' => ['nullable', 'string', 'max:1000', 'regex:~^https://(en\.wikipedia\.org/wiki/|www\.tvmaze\.com/shows/|www\.themoviedb\.org/movie/)[^\s]+$~'],
        ]);

        if (($data['type'] === 'Movies') !== (str_starts_with($title, 'movie:') || str_starts_with($title, 'wiki:'))) {
            throw ValidationException::withMessages(['type' => 'The title type does not match its identifier.']);
        }

        DB::table('watchlist_entries')->upsert([
            'profile_id' => $profile, 'title_key' => $title,
            'details' => json_encode(['id' => $title, ...$data]),
            'created_at' => now(), 'updated_at' => now(),
        ], ['profile_id', 'title_key'], ['details', 'updated_at']);

        return response()->json(['saved' => true]);
    }

    public function removeTitle(string $profile, string $title): JsonResponse
    {
        abort_unless(DB::table('viewer_profiles')->where('id', $profile)->exists(), 404);
        DB::table('watchlist_entries')->where('profile_id', $profile)->where('title_key', $title)->delete();

        return response()->json(['saved' => false]);
    }
}
