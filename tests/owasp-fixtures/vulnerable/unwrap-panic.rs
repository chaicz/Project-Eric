use actix_web::{web, App, HttpResponse, HttpServer};

async fn profile(path: web::Path<(u64,)>) -> HttpResponse {
    // A04: unwrap() on user-controlled input turns a bad request into a panic.
    let id = path.into_inner().0;
    let user = store::find_user(id).unwrap();
    HttpResponse::Ok().body(user.name)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().route("/profile/{id}", web::get().to(profile)))
        .bind(("127.0.0.1", 8080))?
        .run()
        .await
}
