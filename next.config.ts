import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 允许手机通过局域网 IP 访问 dev server 的 /_next/* 资源。
  // 若本机 IP 变化，把新 IP 加进来即可；Next 未来版本会强制校验这里。
  allowedDevOrigins: ["localhost", "127.0.0.1", "10.69.29.63"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // 复盘页面已下线：在路由层做 HTTP 重定向，避免老链接和历史收藏 404。
      {
        source: "/review",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
