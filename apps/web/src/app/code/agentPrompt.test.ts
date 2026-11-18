import { describe, expect, test } from "bun:test";
import { agentPrompt } from "./agentPrompt";

const SLIDER = { slug: "inputs/StretchSlider", title: "Stretch Slider", description: "A pill slider that stretches.", members: [{ title: "Stretch Slider" }] };

describe("agentPrompt", () => {
  test("names the component, says what it is, and links its source and its live page", () => {
    const prompt = agentPrompt(SLIDER, "https://studio.example.com");
    expect(prompt).toStartWith("Add the Stretch Slider component from Trev’s Studio to this project, exactly as it is.");
    expect(prompt).toContain("What it is: A pill slider that stretches.");
    expect(prompt).toContain("Source: https://studio.example.com/code/inputs/StretchSlider.md");
    expect(prompt).toContain("Live: https://studio.example.com/inputs/StretchSlider");
    expect(prompt.split(/\s+/).length).toBeLessThan(130);
  });

  test("asks for a copy as is, not a restyle to the project, and a check against the live version", () => {
    const prompt = agentPrompt(SLIDER, "");
    expect(prompt).toContain("don't restyle it to match this project");
    expect(prompt).toContain("and anything I ask for");
    expect(prompt).toContain("compare with the live version");
    expect(prompt).not.toMatch(/conventions|fit this codebase/);
  });

  test("names every component on a family card, and speaks of them in the plural", () => {
    const prompt = agentPrompt({ slug: "controls", title: "Controls", members: [{ title: "Switch" }, { title: "Stepper" }] }, "");
    expect(prompt).toStartWith("Add the Controls components (Switch, Stepper) from Trev’s Studio to this project, exactly as they are.");
    expect(prompt).toContain("Copy them in as is.");
    expect(prompt).not.toContain("What it is");
  });
});
