export class EditSequence {
  private value = 0;

  mark(): void {
    this.value += 1;
  }

  capture(): number {
    return this.value;
  }

  isCurrent(captured: number): boolean {
    return captured === this.value;
  }

  reset(): void {
    this.value = 0;
  }
}
