<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SuperadminSeeder extends Seeder
{
    /**
     * Seed the superadmin credentials with a default PIN.
     *
     * Default PIN: 123456
     * Change this immediately after first login via the superadmin panel.
     */
    public function run(): void
    {
        if (! DB::table('superadmin_credentials')->exists()) {
            DB::table('superadmin_credentials')->insert([
                'id' => 1,
                'pin_hash' => Hash::make('123456')
            ]);
        }
    }
}
