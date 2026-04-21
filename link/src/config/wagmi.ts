import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { soneiumMinato } from "./chains";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "relm-dev-placeholder";

export const wagmiConfig = getDefaultConfig({
  appName: "Relm — Link Wallet",
  projectId,
  chains: [soneiumMinato],
  ssr: true,
});
