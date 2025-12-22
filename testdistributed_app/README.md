# testdistributed_app

Small HTTP responder used for testing distributed deployments. On HTTP request it returns a small JSON with `hostname`, `pid` and `time`.

Build and push an image to local registry (example):

```bash
# build and push to localhost registry
./build_and_push.sh localhost:5000/testdistributed_app:latest
```
