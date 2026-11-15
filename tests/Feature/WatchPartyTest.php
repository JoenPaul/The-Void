<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WatchPartyTest extends TestCase
{
    use RefreshDatabase;

    private function createAndLoginProfile(string $id, string $name, string $pin = '4567'): void
    {
        $this->putJson('/profiles/'.$id, [
            'name' => $name,
            'avatar' => 'violet',
            'pin' => $pin,
            'pin_confirmation' => $pin,
        ])->assertCreated();

        $this->postJson('/profiles/'.$id.'/login', ['pin' => $pin])->assertOk();
    }

    /**
     * @return array<string, mixed>
     */
    private function sampleMoviePayload(string $titleKey = 'movie:693134', string $title = 'Dune: Part Two', int $position = 45, bool $isPlaying = true): array
    {
        return [
            'title_key' => $titleKey,
            'title' => $title,
            'year' => '2024',
            'type' => 'Movies',
            'genre' => 'Sci-Fi',
            'genres' => ['Sci-Fi'],
            'rating' => '8.5',
            'image' => 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
            'description' => 'Paul Atreides joins the Fremen.',
            'source_url' => null,
            'season' => null,
            'episode' => null,
            'position' => $position,
            'is_playing' => $isPlaying,
        ];
    }

    public function test_unauthenticated_users_cannot_create_or_join_watch_party(): void
    {
        $this->postJson('/party', $this->sampleMoviePayload())->assertStatus(401);
        $this->getJson('/party/abcdefghij')->assertStatus(401);
    }

    public function test_logged_in_profile_becomes_host_and_only_host_can_manipulate_party_state(): void
    {
        $this->createAndLoginProfile('joen', 'Joen');

        $created = $this->postJson('/party', $this->sampleMoviePayload())->assertCreated();
        $code = $created->json('party.code');
        $this->assertNotEmpty($code);
        $created->assertJsonPath('party.host_profile_id', 'joen')
            ->assertJsonPath('party.is_host', true)
            ->assertJsonPath('party.title_key', 'movie:693134')
            ->assertJsonPath('party.position', 45);

        // Log in as an invited friend on an existing profile
        $this->createAndLoginProfile('alex', 'Alex');

        // Friend can join and view the party state, and is marked as guest (is_host = false)
        $this->getJson('/party/'.$code)->assertOk()
            ->assertJsonPath('party.host_profile_id', 'joen')
            ->assertJsonPath('party.host_name', 'Joen')
            ->assertJsonPath('party.is_host', false)
            ->assertJsonPath('party.title_key', 'movie:693134')
            ->assertJsonCount(2, 'party.members');

        // Friend CANNOT change the movie or manipulate playback (403 Forbidden)
        $this->putJson('/party/'.$code, $this->sampleMoviePayload('movie:157336', 'Interstellar', 120, false))
            ->assertStatus(403);

        // Switch back to Host (Admin) and change the movie
        $this->postJson('/profiles/joen/login', ['pin' => '4567'])->assertOk();
        $this->putJson('/party/'.$code, $this->sampleMoviePayload('movie:157336', 'Interstellar', 120, false))
            ->assertOk()
            ->assertJsonPath('party.title_key', 'movie:157336')
            ->assertJsonPath('party.title.title', 'Interstellar')
            ->assertJsonPath('party.position', 120)
            ->assertJsonPath('party.is_playing', false);

        // Host ending the party deletes it for everyone
        $this->deleteJson('/party/'.$code)->assertOk()->assertJsonPath('ended', true);
        $this->getJson('/party/'.$code)->assertNotFound();
    }

    public function test_invitations_are_visible_only_to_the_target_profile_while_the_party_is_ongoing(): void
    {
        $this->getJson('/party-invitations')->assertUnauthorized();
        $this->createAndLoginProfile('alex', 'Alex');
        $this->createAndLoginProfile('sam', 'Sam');
        $this->createAndLoginProfile('joen', 'Joen');

        $code = $this->postJson('/party', $this->sampleMoviePayload())->assertCreated()->json('party.code');
        $path = '/party/'.$code.'/invitations';
        $this->putJson($path, ['profile_id' => 'missing'])->assertUnprocessable();
        $this->putJson($path, ['profile_id' => 'joen'])->assertUnprocessable();
        $this->putJson($path, ['profile_id' => 'alex'])->assertOk();
        $this->putJson($path, ['profile_id' => 'alex'])->assertOk();

        $this->postJson('/profiles/sam/login', ['pin' => '4567'])->assertOk();
        $this->getJson('/party-invitations')->assertExactJson(['invitations' => []]);
        $this->putJson($path, ['profile_id' => 'sam'])->assertForbidden();

        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->getJson('/party-invitations')->assertExactJson(['invitations' => [
            ['code' => $code, 'title' => 'Dune: Part Two', 'host_name' => 'Joen'],
        ]]);
        $this->getJson('/party/'.$code)->assertOk();
        $this->travel(3)->minutes();
        $this->getJson('/party-invitations')->assertExactJson(['invitations' => []]);

        $this->postJson('/profiles/joen/login', ['pin' => '4567'])->assertOk();
        $this->putJson('/party/'.$code, $this->sampleMoviePayload('movie:157336', 'Interstellar'))->assertOk();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->getJson('/party-invitations')->assertJsonPath('invitations.0.title', 'Interstellar');

        $this->postJson('/profiles/joen/login', ['pin' => '4567'])->assertOk();
        $this->deleteJson('/party/'.$code)->assertOk();
        $this->assertDatabaseMissing('watch_party_invitations', ['party_code' => $code]);
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->getJson('/party-invitations')->assertExactJson(['invitations' => []]);
        $this->getJson('/party/'.$code)->assertNotFound();
    }

    public function test_tabs_signed_into_different_profiles_keep_their_watch_party_roles(): void
    {
        $this->createAndLoginProfile('guest', 'Guest');
        $this->createAndLoginProfile('dummy', 'Dummy');

        $tabLogin = ['X-Viewer-Tab' => '1'];
        $guest = ['X-Viewer-Token' => $this->postJson('/profiles/guest/login', ['pin' => '4567'], $tabLogin)->assertOk()->json('viewer_token')];
        $dummy = ['X-Viewer-Token' => $this->postJson('/profiles/dummy/login', ['pin' => '4567'], $tabLogin)->assertOk()->json('viewer_token')];

        $code = $this->postJson('/party', $this->sampleMoviePayload(), $guest)
            ->assertCreated()->assertJsonPath('party.host_profile_id', 'guest')->json('party.code');
        $this->putJson('/party/'.$code.'/invitations', ['profile_id' => 'dummy'], $guest)->assertOk();
        $this->getJson('/party-invitations', $guest)->assertExactJson(['invitations' => []]);
        $this->getJson('/party-invitations', $dummy)->assertJsonPath('invitations.0.code', $code);
        $this->getJson('/party/'.$code, $dummy)->assertJsonPath('party.is_host', false);
        $this->deleteJson('/party/'.$code, [], $guest)->assertJsonPath('ended', true);
        $this->getJson('/party-invitations', $dummy)->assertExactJson(['invitations' => []]);

        $nextCode = $this->postJson('/party', $this->sampleMoviePayload(), $guest)
            ->assertCreated()->assertJsonPath('party.host_profile_id', 'guest')->json('party.code');
        $this->putJson('/party/'.$nextCode.'/invitations', ['profile_id' => 'dummy'], $guest)->assertOk();
        $this->postJson('/profile-logout', [], $dummy)->assertOk();
        $this->getJson('/party-invitations', $dummy)->assertUnauthorized();
        $this->getJson('/party/'.$nextCode, $guest)->assertJsonPath('party.is_host', true);
    }
}
