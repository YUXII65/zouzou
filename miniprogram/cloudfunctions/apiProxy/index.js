const https = require("https");

const BASE_HOST = "nextstep9.work";

exports.main = async (event = {}) => {
  const path = typeof event.path === "string" && event.path.startsWith("/")
    ? event.path
    : "/";
  const method = String(event.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json" };
  if (event.token) headers.Authorization = `Bearer ${event.token}`;

  const body = event.data === undefined || method === "GET" || method === "HEAD"
    ? null
    : JSON.stringify(event.data);

  return new Promise((resolve) => {
    const request = https.request(
      {
        hostname: BASE_HOST,
        port: 443,
        path,
        method,
        headers,
        timeout: 25000
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { raw += chunk; });
        response.on("end", () => {
          let data = raw;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (error) {
            // 保持原始文本，交给小程序端按 statusCode 处理。
          }
          resolve({ statusCode: response.statusCode || 500, data });
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => {
      resolve({
        statusCode: 502,
        data: { error: "cloud_proxy_error", message: error.message }
      });
    });

    if (body) request.write(body);
    request.end();
  });
};
