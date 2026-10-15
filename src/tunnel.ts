import ngrok from "@ngrok/ngrok";
import { env } from "./config.js";

export async function startTunnel(): Promise<void> {
  if (!env.NGROK_AUTHTOKEN || !env.NGROK_DOMAIN) return;
  try {
    const listener = await ngrok.forward({
      addr: env.PORT,
      authtoken: env.NGROK_AUTHTOKEN,
      domain: env.NGROK_DOMAIN,
    });
    console.log(`Public URL: ${listener.url()}/mcp`);
  } catch (err) {
    console.error("ngrok failed to start:", err);
  }
}

export async function stopTunnel(): Promise<void> {
  await ngrok.disconnect().catch(() => {});
}
