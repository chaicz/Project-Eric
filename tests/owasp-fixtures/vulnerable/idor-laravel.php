<?php
// A01: the route takes a user-supplied id and never checks who is asking.
Route::get('/users/{id}', function (Request $request) {
    $id = $request->input('id');
    $user = User::find($id);
    return response()->json($user);
});
