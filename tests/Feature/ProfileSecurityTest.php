<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProfileSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function createProfile(string $id = 'alex'): void
    {
        $this->putJson('/profiles/'.$id, ['name' => $id, 'avatar' => 'moon', 'pin' => '0456', 'pin_confirmation' => '0456'])->assertCreated();
    }

    public function test_only_admin_can_archive_and_restore_profiles_without_losing_their_pin(): void
    {
        $this->createProfile();
        $this->createProfile('guest');
        $this->putJson('/superadmin/profiles/alex/archive', ['archived' => true])->assertUnauthorized();
        DB::table('superadmin_credentials')->insert(['id' => 1, 'pin_hash' => Hash::make('87654321')]);
        $this->postJson('/superadmin/login', ['pin' => '87654321'])->assertOk();
        $this->putJson('/superadmin/profiles/alex/archive', ['archived' => true])->assertOk();
        $this->getJson('/profiles')->assertJsonCount(1, 'profiles');
        $this->postJson('/profiles/alex/login', ['pin' => '0456'])->assertUnprocessable();
        $this->putJson('/superadmin/profiles/guest/archive', ['archived' => true])->assertUnprocessable();
        $this->putJson('/superadmin/profiles/alex/archive', ['archived' => false])->assertOk();
        $this->getJson('/profiles')->assertJsonCount(2, 'profiles');
        $this->postJson('/profiles/alex/login', ['pin' => '0456'])->assertOk();
        $this->putJson('/superadmin/profiles/missing/archive', ['archived' => false])->assertNotFound();
    }

    public function test_creation_requires_a_confirmed_pin_and_never_returns_the_hash(): void
    {
        $data = ['name' => 'Alex', 'avatar' => 'moon'];
        $this->putJson('/profiles/alex', $data)->assertUnprocessable()->assertJsonValidationErrors('pin');
        $this->putJson('/profiles/alex', [...$data, 'pin' => '123', 'pin_confirmation' => '123'])->assertUnprocessable();
        $this->putJson('/profiles/alex', [...$data, 'pin' => '0456', 'pin_confirmation' => '9999'])->assertUnprocessable();
        $this->createProfile();
        $hash = DB::table('viewer_profiles')->value('pin_hash');
        $this->assertTrue(Hash::check('0456', $hash));
        $this->getJson('/profiles')->assertDontSee($hash)->assertJsonMissingPath('profiles.0.pin_hash');
    }

    public function test_profile_data_edits_and_archives_require_its_own_pin(): void
    {
        $this->createProfile();
        $this->createProfile('guest');
        foreach (['watchlist', 'history'] as $path) {
            $this->getJson('/profiles/alex/'.$path)->assertUnauthorized();
        }
        $this->putJson('/profiles/alex', ['name' => 'Stolen', 'avatar' => 'moon'])->assertUnauthorized();
        $this->deleteJson('/profiles/alex')->assertStatus(405);
        $this->putJson('/profiles/alex/watchlist/movie:42', [])->assertUnauthorized();
        $this->putJson('/profiles/alex/history/movie:42', [])->assertUnauthorized();
        $this->deleteJson('/profiles/alex/watchlist/movie:42')->assertUnauthorized();
        $this->postJson('/profiles/alex/login', ['pin' => '9999'])->assertUnprocessable();
        $this->postJson('/profiles/alex/login', ['pin' => '0456'])->assertOk();
        $this->getJson('/profiles/alex/watchlist')->assertOk();
        $this->deleteJson('/profiles/alex')->assertStatus(405);
        $this->getJson('/profiles/guest/watchlist')->assertUnauthorized();
        $this->postJson('/profile-logout')->assertOk();
        $this->getJson('/profiles/alex/history')->assertUnauthorized();
    }

    public function test_admin_reset_revokes_existing_sessions_and_requires_a_new_pin(): void
    {
        DB::table('superadmin_credentials')->insert(['id' => 1, 'pin_hash' => Hash::make('87654321')]);
        $this->createProfile();
        $this->postJson('/profiles/alex/login', ['pin' => '0456'])->assertOk();
        $this->getJson('/superadmin/profiles')->assertUnauthorized();
        $this->putJson('/superadmin/profiles/alex/pin')->assertUnauthorized();
        $this->postJson('/superadmin/login', ['pin' => '999999'])->assertUnprocessable();
        $this->postJson('/superadmin/login', ['pin' => '87654321'])->assertOk();
        $this->getJson('/superadmin/profiles')->assertOk()->assertJsonStructure(['profiles' => [['name', 'avatar', 'created_at']]])->assertJsonMissingPath('profiles.0.pin_hash');
        $this->putJson('/superadmin/profiles/alex/pin')->assertOk();
        $this->getJson('/profiles/alex/watchlist')->assertUnauthorized();
        $this->postJson('/profiles/alex/login', ['pin' => '0456'])->assertUnprocessable();
        $this->postJson('/profiles/alex/login', ['pin' => '123'])->assertOk()->assertJsonPath('must_change_pin', true);
        $this->getJson('/profiles/alex/watchlist')->assertForbidden();
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon'])->assertForbidden();
        $this->putJson('/profiles/alex/pin', ['current_pin' => 'wrong', 'pin' => '5678', 'pin_confirmation' => '5678'])->assertUnprocessable();
        $this->putJson('/profiles/alex/pin', ['current_pin' => '123', 'pin' => '5678', 'pin_confirmation' => '5678'])->assertOk();
        $this->getJson('/profiles/alex/watchlist')->assertOk();
        $this->deleteJson('/profiles/alex')->assertStatus(405);
        $this->postJson('/superadmin/logout')->assertOk();
        $this->getJson('/superadmin/profiles')->assertUnauthorized();
    }

    public function test_admin_pin_change_validates_current_pin_and_revokes_old_sessions(): void
    {
        DB::table('superadmin_credentials')->insert(['id' => 1, 'pin_hash' => Hash::make('87654321')]);
        $this->putJson('/superadmin/pin', [])->assertUnauthorized();
        $this->postJson('/superadmin/login', ['pin' => '87654321'])->assertOk();
        $oldSession = session('superadmin');
        $this->putJson('/superadmin/pin', ['current_pin' => '999999', 'pin' => '12345678', 'pin_confirmation' => '12345678'])->assertUnprocessable();
        $this->putJson('/superadmin/pin', ['current_pin' => '87654321', 'pin' => '12345678', 'pin_confirmation' => '999999'])->assertUnprocessable();
        $this->putJson('/superadmin/pin', ['current_pin' => '87654321', 'pin' => '12345678', 'pin_confirmation' => '12345678'])->assertOk();
        $this->getJson('/superadmin/profiles')->assertOk();
        $this->withSession(['superadmin' => $oldSession])->getJson('/superadmin/profiles')->assertUnauthorized();
        $this->postJson('/superadmin/login', ['pin' => '87654321'])->assertUnprocessable();
        $this->postJson('/superadmin/login', ['pin' => '12345678'])->assertOk();
    }

    public function test_pin_changes_require_confirmation_and_revoke_other_sessions(): void
    {
        $this->createProfile();
        $this->postJson('/profiles/alex/login', ['pin' => '0456'])->assertOk();
        $oldSession = session('viewer');
        $this->putJson('/profiles/alex/pin', ['current_pin' => '0456', 'pin' => '5678', 'pin_confirmation' => '0000'])->assertUnprocessable();
        $this->putJson('/profiles/alex/pin', ['current_pin' => '0456', 'pin' => '5678', 'pin_confirmation' => '5678'])->assertOk();
        $this->getJson('/profiles/alex/history')->assertOk();
        $this->withSession(['viewer' => $oldSession])->getJson('/profiles/alex/history')->assertUnauthorized();
    }

    public function test_login_attempts_are_rate_limited_and_admin_has_no_default_password(): void
    {
        
        $this->postJson('/superadmin/login', ['pin' => '123456'])->assertUnprocessable();
        $this->createProfile();
        foreach (range(1, 5) as $attempt) {
            $this->postJson('/profiles/alex/login', ['pin' => '9999'])->assertUnprocessable();
        }
        $this->postJson('/profiles/alex/login', ['pin' => '0456'])->assertTooManyRequests();
    }
}
