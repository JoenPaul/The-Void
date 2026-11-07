<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ProfileAuthController extends Controller
{
    public static function authorize(string $profile, bool $allowPinChange = false): object
    {
        $record = DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->first();
        abort_unless($record, 404);
        abort_unless(request()->session()->get('viewer.id') === $profile
            && hash_equals(hash('sha256', $record->pin_hash ?? ''), request()->session()->get('viewer.version', '')), 401, 'Enter your profile PIN to continue.');
        abort_if($record->must_change_pin && ! $allowPinChange, 403, 'Choose a new PIN before continuing.');

        return $record;
    }

    public function login(Request $request, string $profile): JsonResponse
    {
        $data = $request->validate(['pin' => ['required', 'string', 'regex:/^[0-9]{3,12}$/']]);
        $record = DB::table('viewer_profiles')->where('id', $profile)->whereNull('deleted_at')->first();
        if (! $record || ! $record->pin_hash || ! Hash::check($data['pin'], $record->pin_hash)) {
            throw ValidationException::withMessages(['pin' => 'Incorrect PIN. Please try again.']);
        }
        $request->session()->regenerate();
        $request->session()->put('viewer', ['id' => $profile, 'version' => hash('sha256', $record->pin_hash)]);

        return response()->json(['must_change_pin' => (bool) $record->must_change_pin]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->session()->forget('viewer');
        $request->session()->regenerate();

        return response()->json(['logged_out' => true]);
    }

    public function changePin(Request $request, string $profile): JsonResponse
    {
        return DB::transaction(function () use ($request, $profile): JsonResponse {
            DB::table('viewer_profiles')->where('id', $profile)->lockForUpdate()->first();
            $record = self::authorize($profile, true);
            $data = $request->validate([
                'current_pin' => ['required', 'string', 'max:12'],
                'pin' => ['required', 'string', 'regex:/^[0-9]{4,12}$/', 'confirmed', 'different:current_pin'],
            ]);
            if (! Hash::check($data['current_pin'], $record->pin_hash)) {
                throw ValidationException::withMessages(['current_pin' => 'Your current PIN is incorrect.']);
            }
            $hash = Hash::make($data['pin']);
            DB::table('viewer_profiles')->where('id', $profile)->update(['pin_hash' => $hash, 'must_change_pin' => false, 'updated_at' => now()]);
            $request->session()->regenerate();
            $request->session()->put('viewer.version', hash('sha256', $hash));

            return response()->json(['changed' => true]);
        });
    }
}
