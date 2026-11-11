<?php
// The route checks the caller's permissions before returning the record.
Route::get('/users/{id}', function (Request $request) {
    $id = $request->input('id');
    $user = User::find($id);
    abort_unless($user && $request->user()->can('view', $user), 403);
    return response()->json($user);
});
