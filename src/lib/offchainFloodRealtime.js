import { createClient } from "@supabase/supabase-js";

function env(name) {
  return String(import.meta.env?.[name] || "").trim();
}

export function createOffchainFloodRealtime(onMessage) {
  const url = env("VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  const channelName = env("VITE_SUPABASE_FLOOD_CHANNEL") || "quai_offchain_flood";

  if (!url || !anonKey) {
    return {
      enabled: false,
      async sendMessage() {},
      async dispose() {},
    };
  }

  const client = createClient(url, anonKey);
  const channel = client.channel(channelName, {
    config: {
      broadcast: { self: false },
    },
  });

  channel.on("broadcast", { event: "flood-message" }, ({ payload }) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    onMessage(payload);
  });
  channel.subscribe();

  return {
    enabled: true,
    async sendMessage(message) {
      await channel.send({
        type: "broadcast",
        event: "flood-message",
        payload: message,
      });
    },
    async dispose() {
      await client.removeChannel(channel);
    },
  };
}
