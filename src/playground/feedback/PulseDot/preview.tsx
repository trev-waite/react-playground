import { PulseDot } from "./PulseDot";

export const meta = {
  title: "Pulse Dot",
};

export default function PulseDotPreview() {
  return (
    <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
      <PulseDot label="Live" tone="live" />
      <PulseDot label="Idle" tone="idle" />
    </div>
  );
}
