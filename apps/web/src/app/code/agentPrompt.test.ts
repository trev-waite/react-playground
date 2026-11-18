import { describe, expect, test } from "bun:test";
import { agentPrompt } from "./agentPrompt";

describe("agentPrompt", () => {
  test("names the component, says what it is, and links its full source", () => {
    const prompt = agentPrompt(
      { slug: "inputs/StretchSlider", title: "Stretch Slider", description: "A pill slider that stretches.", members: [{ title: "Stretch Slider" }] },
      "https://studio.example.com",
    );
    expect(prompt).toStartWith("Add the Stretch Slider component from Trev’s Studio to this project.");
    expect(prompt).toContain("What it is: A pill slider that stretches.");
    expect(prompt).toContain("Source: https://studio.example.com/code/inputs/StretchSlider.md");
    expect(prompt.split(/\s+/).length).toBeLessThan(120);
  });

  test("names every component on a family card", () => {
    const prompt = agentPrompt({ slug: "controls", title: "Controls", members: [{ title: "Switch" }, { title: "Stepper" }] }, "");
    expect(prompt).toStartWith("Add the Controls components (Switch, Stepper) from Trev’s Studio");
    expect(prompt).not.toContain("What it is");
  });
});
