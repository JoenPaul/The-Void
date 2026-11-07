<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class SuperadminController extends Controller
{
    private function authorize(Request $request): void
    {
        $hash = DB::table('superadmin_credentials')->where('id', 1)->value('pin_hash');
        abort_unless($hash && hash_equals(hash('sha256', $hash), $request->session()->get('superadmin', '')), 401, 'Sign in as superadmin to continue.');
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['pin' => ['required', 'string', 'regex:/^[0-9]{6,12}$/']]);
        $hash = DB::table('superadmin_credentials')->where('id', 1)->value('pin_hash');
        if (! $hash || ! Hash::check($data['pin'], $hash)) {
            throw ValidationException::withMessages(['pin' => 'Incorrect superadmin PIN.']);
        }
        $request->session()->regenerate();
        $request->session()->put('superadmin', hash('sha256', $hash));

        return response()->json(['authenticated' => true]);
    }

    public function changePin(Request $request): JsonResponse
    {
        return DB::transaction(function () use ($request): JsonResponse {
            $record = DB::table('superadmin_credentials')->where('id', 1)->lockForUpdate()->first();
            $this->authorize($request);
            $data = $request->validate(['current_pin' => ['required', 'string', 'max:12'], 'pin' => ['required', 'string', 'regex:/^[0-9]{6,12}$/', 'confirmed', 'different:current_pin']]);
            if (! Hash::check($data['current_pin'], $record->pin_hash)) {
                throw ValidationException::withMessages(['current_pin' => 'Current PIN is incorrect.']);
            }
            $hash = Hash::make($data['pin']);
            DB::table('superadmin_credentials')->where('id', 1)->update(['pin_hash' => $hash]);
            $request->session()->regenerate();
            $request->session()->put('superadmin', hash('sha256', $hash));
            return response()->json(['changed' => true]);
        });
    }

    public function logout(Request $request): JsonResponse
    {
        $request->session()->forget('superadmin');
        $request->session()->regenerate();

        return response()->json(['logged_out' => true]);
    }

    public function profiles(Request $request): JsonResponse
    {
        $this->authorize($request);

        return response()->json(['profiles' => DB::table('viewer_profiles')->orderByDesc('created_at')->orderBy('id')->get(['id', 'name', 'avatar', 'created_at', 'deleted_at'])]);
    }

    public function setArchived(Request $request, string $profile): JsonResponse
    {
        $this->authorize($request);
        $data = $request->validate(['archived' => ['required', 'boolean']]);

        return DB::transaction(function () use ($data, $profile): JsonResponse {
            $profiles = DB::table('viewer_profiles')->lockForUpdate()->get();
            $record = $profiles->firstWhere('id', $profile);
            abort_unless($record, 404);
            if ($data['archived'] && $record->deleted_at === null && $profiles->whereNull('deleted_at')->count() <= 1) {
                throw ValidationException::withMessages(['profile' => 'Keep at least one active profile. Unarchive or add another profile first.']);
            }
            if ((bool) $record->deleted_at !== $data['archived']) {
                DB::table('viewer_profiles')->where('id', $profile)->update(['deleted_at' => $data['archived'] ? now() : null, 'updated_at' => now()]);
            }

            return response()->json(['archived' => $data['archived']]);
        });
    }

    public function resetPin(Request $request, string $profile): JsonResponse
    {
        $this->authorize($request);
        $updated = DB::table('viewer_profiles')->where('id', $profile)->update([
            'pin_hash' => Hash::make('123'), 'must_change_pin' => true, 'updated_at' => now(),
        ]);
        abort_unless($updated, 404);

        return response()->json(['reset' => true]);
    }
}
