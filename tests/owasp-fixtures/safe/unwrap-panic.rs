use actix_web::{web, App, HttpResponse, HttpServer};

async fn profile(path: web::Path<(u64,)>) -> HttpResponse {
    // The not-found case is handled instead of panicking.
    let id = path.into_inner().0;
    match store::find_user(id) {
        // Ownership is checked before the record is returned.
        Some(user) if user.owner_id == auth::current_user_id() => {
            HttpResponse::Ok().body(user.name)
        }
        Some(_) => HttpResponse::Forbidden().body("forbidden"),
        None => HttpResponse::NotFound().body("not found"),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/profile/{id}", web::get().to(profile))
            // Every route behind the id is authenticated first.
            .wrap(auth::RequireAuth)
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
