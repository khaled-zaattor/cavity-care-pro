<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PrescriptionItem extends Model
{
    use HasUuids;

    protected $fillable = [
        'prescription_id', 'medicine_id', 'medicine_name', 'dose', 'frequency', 'duration',
        'route', 'quantity', 'instructions', 'sort_order',
    ];
}
