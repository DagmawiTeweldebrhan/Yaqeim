/** Wilson lower bound (95% confidence), expressed as a percentage of matching reviews. */
export function confidenceScore(matches: number, total: number) {
  if (total <= 0 || matches < 0 || matches > total) return 0;
  const proportion = matches / total;
  return (
    Math.round(
      ((proportion +
        3.8416 / (2 * total) -
        1.96 * Math.sqrt((proportion * (1 - proportion)) / total + 3.8416 / (4 * total * total))) /
        (1 + 3.8416 / total)) *
        10000,
    ) / 100
  );
}
