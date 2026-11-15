<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('watch_party_invitations', function (Blueprint $table): void {
            $table->string('party_code', 24);
            $table->string('profile_id', 64)->index();
            $table->timestamp('created_at');
            $table->primary(['party_code', 'profile_id']);
            $table->foreign('party_code')->references('code')->on('watch_parties')->cascadeOnDelete();
            $table->foreign('profile_id')->references('id')->on('viewer_profiles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('watch_party_invitations');
    }
};
