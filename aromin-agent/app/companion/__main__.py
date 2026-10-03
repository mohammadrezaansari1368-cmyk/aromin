"""Run the local interface gateway; never listen on a public network interface."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.companion.bridge:create_app", factory=True, host="127.0.0.1", port=8877)
