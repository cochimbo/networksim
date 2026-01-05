use crate::state::PeersMap;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, Server};
use std::sync::Arc;
use tokio::sync::RwLock;

pub fn spawn_http_server(peers: Arc<RwLock<PeersMap>>, port: u16) {
    tokio::spawn(async move {
        async fn handle(
            req: Request<Body>,
            peers: Arc<RwLock<PeersMap>>,
        ) -> Result<Response<Body>, hyper::Error> {
            match (req.method(), req.uri().path()) {
                (&hyper::Method::GET, "/peers") => {
                    let p = peers.read().await;
                    let body = serde_json::to_string(&*p).unwrap_or_else(|_| "{}".into());
                    Ok(Response::new(Body::from(body)))
                }
                _ => Ok(Response::builder()
                    .status(404)
                    .body(Body::from("not found"))
                    .unwrap()),
            }
        }

        let make_svc = make_service_fn(move |_| {
            let peers = peers.clone();
            async move { Ok::<_, hyper::Error>(service_fn(move |req| handle(req, peers.clone()))) }
        });

        let addr = ([0, 0, 0, 0], port).into();
        let server = Server::bind(&addr).serve(make_svc);
        log::info!("HTTP server running on http://{}", addr);
        if let Err(e) = server.await {
            log::error!("HTTP server error: {}", e);
        }
    });
}
