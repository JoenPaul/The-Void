<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WatchPartyController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $profile = $this->authorizeCurrentProfile($request);
        $state = $this->validatePartyState($request);

        return DB::transaction(function () use ($profile, $state): JsonResponse {
            $code = '';
            do {
                $code = Str::random(10);
            } while (DB::table('watch_parties')->where('code', $code)->exists());

            $now = now()->format('Y-m-d H:i:s.u');
            DB::table('watch_parties')->insert([
                'code' => $code,
                'host_profile_id' => $profile->id,
                'title_key' => $state['title_key'],
                'details' => json_encode($state['details']),
                'season' => $state['season'],
                'episode' => $state['episode'],
                'position' => $state['position'],
                'is_playing' => $state['is_playing'],
                'synced_at' => $now,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('watch_party_members')->upsert([
                'party_code' => $code,
                'profile_id' => $profile->id,
                'last_seen_at' => $now,
            ], ['party_code', 'profile_id'], ['last_seen_at']);

            $party = DB::table('watch_parties')->where('code', $code)->first();

            return response()->json(['party' => $this->partyPayload($party, $profile)], 201);
        }, 3);
    }

    public function show(Request $request, string $code): JsonResponse
    {
        $profile = $this->authorizeCurrentProfile($request);
        $party = DB::table('watch_parties')->where('code', $code)->first();
        abort_unless($party !== null, 404, 'This watch party has ended or does not exist.');

        $hostExists = DB::table('viewer_profiles')
            ->where('id', $party->host_profile_id)
            ->whereNull('deleted_at')
            ->exists();
        abort_unless($hostExists, 404, 'This watch party has ended or does not exist.');

        DB::table('watch_party_members')->upsert([
            'party_code' => $code,
            'profile_id' => $profile->id,
            'last_seen_at' => now()->format('Y-m-d H:i:s.u'),
        ], ['party_code', 'profile_id'], ['last_seen_at']);

        return response()->json(['party' => $this->partyPayload($party, $profile)]);
    }

    public function update(Request $request, string $code): JsonResponse
    {
        $profile = $this->authorizeCurrentProfile($request);

        return DB::transaction(function () use ($request, $code, $profile): JsonResponse {
            $party = DB::table('watch_parties')->where('code', $code)->lockForUpdate()->first();
            abort_unless($party !== null, 404, 'This watch party has ended or does not exist.');
            abort_unless(
                $party->host_profile_id === $profile->id,
                403,
                'Only the watch party admin can change or control the movie.'
            );

            $state = $this->validatePartyState($request);
            $now = now()->format('Y-m-d H:i:s.u');

            DB::table('watch_parties')->where('code', $code)->update([
                'title_key' => $state['title_key'],
                'details' => json_encode($state['details']),
                'season' => $state['season'],
                'episode' => $state['episode'],
                'position' => $state['position'],
                'is_playing' => $state['is_playing'],
                'synced_at' => $now,
                'updated_at' => now(),
            ]);

            DB::table('watch_party_members')->upsert([
                'party_code' => $code,
                'profile_id' => $profile->id,
                'last_seen_at' => $now,
            ], ['party_code', 'profile_id'], ['last_seen_at']);

            $updated = DB::table('watch_parties')->where('code', $code)->first();

            return response()->json(['party' => $this->partyPayload($updated, $profile)]);
        }, 3);
    }

    public function destroy(Request $request, string $code): JsonResponse
    {
        $profile = $this->authorizeCurrentProfile($request);
        $party = DB::table('watch_parties')->where('code', $code)->first();
        abort_unless($party !== null, 404, 'This watch party has ended or does not exist.');

        if ($party->host_profile_id === $profile->id) {
            DB::table('watch_parties')->where('code', $code)->delete();

            return response()->json(['ended' => true]);
        }

        DB::table('watch_party_members')
            ->where('party_code', $code)
            ->where('profile_id', $profile->id)
            ->delete();

        return response()->json(['left' => true]);
    }

    private function authorizeCurrentProfile(Request $request): object
    {
        $profileId = (string) $request->session()->get('viewer.id', '');
        abort_if($profileId === '', 401, 'Enter your profile PIN to continue.');

        return ProfileAuthController::authorize($profileId);
    }

    /**
     * @return array{
     *     title_key: string,
     *     details: array<string, mixed>,
     *     season: int|null,
     *     episode: int|null,
     *     position: int,
     *     is_playing: bool
     * }
     */
    private function validatePartyState(Request $request): array
    {
        $data = $request->validate([
            'title_key' => ['required', 'string', 'regex:/^((movie|tv|tvmaze):[0-9]{1,20}|wiki:[a-f0-9]{24})$/'],
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
            'season' => ['nullable', 'required_if:type,Series', 'prohibited_if:type,Movies', 'integer', 'min:0', 'max:1000'],
            'episode' => ['nullable', 'required_if:type,Series', 'prohibited_if:type,Movies', 'integer', 'min:1', 'max:5000'],
            'position' => ['required', 'integer', 'min:0', 'max:604800'],
            'is_playing' => ['required', 'boolean'],
        ]);

        if (($data['type'] === 'Movies') !== (str_starts_with($data['title_key'], 'movie:') || str_starts_with($data['title_key'], 'wiki:'))) {
            throw ValidationException::withMessages(['type' => 'The title type does not match its identifier.']);
        }

        return [
            'title_key' => $data['title_key'],
            'details' => [
                'id' => $data['title_key'],
                'title' => $data['title'],
                'year' => $data['year'],
                'type' => $data['type'],
                'genre' => $data['genre'],
                'genres' => $data['genres'],
                'rating' => $data['rating'],
                'image' => $data['image'] ?? null,
                'description' => $data['description'],
                'source_url' => $data['source_url'] ?? null,
            ],
            'season' => isset($data['season']) ? (int) $data['season'] : null,
            'episode' => isset($data['episode']) ? (int) $data['episode'] : null,
            'position' => (int) $data['position'],
            'is_playing' => (bool) $data['is_playing'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function partyPayload(object $party, object $viewer): array
    {
        $host = DB::table('viewer_profiles')
            ->where('id', $party->host_profile_id)
            ->first(['id', 'name', 'avatar']);

        $cutoff = now()->subSeconds(30)->format('Y-m-d H:i:s.u');
        $members = DB::table('watch_party_members')
            ->join('viewer_profiles', 'viewer_profiles.id', '=', 'watch_party_members.profile_id')
            ->where('watch_party_members.party_code', $party->code)
            ->whereNull('viewer_profiles.deleted_at')
            ->where('watch_party_members.last_seen_at', '>=', $cutoff)
            ->orderBy('watch_party_members.last_seen_at')
            ->get(['viewer_profiles.id', 'viewer_profiles.name', 'viewer_profiles.avatar'])
            ->map(fn (object $member): array => [
                'id' => $member->id,
                'name' => $member->name,
                'avatar' => $member->avatar,
            ])
            ->values()
            ->all();

        $syncedAt = Carbon::parse($party->synced_at);
        $elapsed = (bool) $party->is_playing
            ? max(0, (int) floor($syncedAt->diffInSeconds(now(), false)))
            : 0;
        $livePosition = min(604800, (int) $party->position + $elapsed);

        return [
            'code' => $party->code,
            'host_profile_id' => $party->host_profile_id,
            'host_name' => $host->name ?? $party->host_profile_id,
            'is_host' => $party->host_profile_id === $viewer->id,
            'title_key' => $party->title_key,
            'title' => json_decode($party->details, true),
            'season' => $party->season === null ? null : (int) $party->season,
            'episode' => $party->episode === null ? null : (int) $party->episode,
            'position' => $livePosition,
            'is_playing' => (bool) $party->is_playing,
            'synced_at' => $syncedAt->toIso8601String(),
            'members' => $members,
        ];
    }
}
