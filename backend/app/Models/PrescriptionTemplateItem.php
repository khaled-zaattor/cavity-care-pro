<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PrescriptionTemplateItem extends Model
{
    use HasUuids;

    protected $fillable = [
        'prescription_template_id', 'medicine_id', 'medicine_name', 'dose', 'frequency', 'duration',
        'route', 'quantity', 'instructions', 'sort_order',
    ];
}
