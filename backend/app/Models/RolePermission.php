<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** UI toggles from صلاحيات الأدوار (same data as Supabase role_permissions). */
class RolePermission extends Model
{
    use HasUuids;

    protected $fillable = ['role', 'resource', 'can_create', 'can_update', 'can_delete'];

    protected function casts(): array
    {
        return ['can_create' => 'boolean', 'can_update' => 'boolean', 'can_delete' => 'boolean'];
    }
}
