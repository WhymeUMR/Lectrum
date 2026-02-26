const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

test("health endpoint returns ok", async () => {
  const serviceName = "test-service";
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: serviceName }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const body = await new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/health`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, data }));
      })
      .on("error", reject);
  });

  assert.equal(body.statusCode, 200);
  const json = JSON.parse(body.data);
  assert.equal(json.status, "ok");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});
