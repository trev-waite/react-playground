import { OmniAgentBar } from "./OmniAgentBar";

export const meta = {
  title: "Agent Bar",
};

export default function OmniAgentBarPreview() {
  return (
    <div
      style={{
        width: "min(100vw - 2rem, 36rem)",
        display: "grid",
        placeItems: "center",
        padding: "1rem 0",
      }}
    >
      <OmniAgentBar />
    </div>
  );
}
