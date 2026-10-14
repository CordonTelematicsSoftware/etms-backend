export const capitalizeFirstLetter = (text: string) => {
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const hasWhiteSpace = (text: string) => {
  return /\s/g.test(text);
};

export const escapeStringRegexp = (text: string) => {
  if (typeof text !== 'string') {
    throw new TypeError('Expected a string');
  }

  // Escape characters with special meaning either inside or outside character sets.
  // Use a simple backslash escape when it’s always valid, and a `\xnn` escape when the simpler form would be disallowed by Unicode patterns’ stricter grammar.
  return text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
};

export const capitalizeAllFirstLetters = (val: string) => {
  return val.toLowerCase().split(' ').map(capitalizeFirstLetter).join(' ');
};
