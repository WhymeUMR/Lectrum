const http = require("http");

const serviceName = process.env.SERVICE_NAME || "service";
const port = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: serviceName }));
    return;
  }

  if (req.url === "/ready") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ready", service: serviceName }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ service: serviceName }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`${serviceName} listening on :${port}`);
});
