<?php

/*
| CORS for the React app when it lives on a DIFFERENT subdomain than the API
| (e.g. app https://care-pro.example.com, API https://care-back.example.com).
| Same-origin setups (/api under the site) don't need this at all.
|
| FRONTEND_URL: comma-separated origins of the React app.
| Cookies (session + XSRF) are shared through SESSION_DOMAIN=.example.com.
*/

return [

    // Laravel routes have no /api prefix (see bootstrap/app.php), so all paths.
    'paths' => ['*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('FRONTEND_URL', ''))))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    // so the browser may read file names of downloads
    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 3600,

    // Sanctum SPA: the session cookie must travel with cross-subdomain requests.
    'supports_credentials' => true,

];
