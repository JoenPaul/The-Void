<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('viewer_profiles', function (Blueprint $table): void {
            $table->string('pin_hash')->nullable();
            $table->boolean('must_change_pin')->default(true);
        });
        DB::table('viewer_profiles')->orderBy('id')->each(function (object $profile): void {
            DB::table('viewer_profiles')->where('id', $profile->id)->update(['pin_hash' => Hash::make('123')]);
        });
    }

    public function down(): void
    {
        Schema::table('viewer_profiles', function (Blueprint $table): void {
            $table->dropColumn(['pin_hash', 'must_change_pin']);
        });
    }
};
