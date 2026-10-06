module.exports = {
  apps: [
    {
      name: "mcp-server",
      script: "./dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ngrok-tunnel",
      script: "ngrok",
      args: "http --domain=YOUR_STATIC_DOMAIN.ngrok-free.app 3000",
      interpreter: "none", // Execute binary directly
      autorestart: true,
    },
  ],
};
