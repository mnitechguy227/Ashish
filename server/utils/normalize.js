function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIssn(value = '') {
  return String(value).toUpperCase().replace(/[^0-9X]/g, '');
}

function levenshteinDistance(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function similarityScore(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left && !right) return 1;
  const maxLen = Math.max(left.length, right.length) || 1;
  return 1 - levenshteinDistance(left, right) / maxLen;
}

module.exports = {
  normalizeText,
  normalizeIssn,
  similarityScore,
};
