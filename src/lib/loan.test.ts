import { describe, expect, it } from "vitest";
import { computeAmount, isValidCPF } from "./loan";

describe("loan rules", () => {
  it("never offers less than R$700", () => expect(computeAmount(300, "r1")).toBe(700));
  it("never offers more than R$2.500", () => expect(computeAmount(950, "r4")).toBe(2500));
  it("validates CPF check digits", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("529.982.247-24")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
  });
});
