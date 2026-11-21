<?php

namespace Tests;

use App\Support\DoctorBooks;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        DoctorBooks::flush();
    }
}
