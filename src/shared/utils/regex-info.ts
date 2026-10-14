export const generatePasswordInfoFromRegex = (pattern: RegExp): string => {
  const infoParts: string[] = [];

  // Convert pattern to string to avoid escaping issues
  const patternString: string = pattern.toString();

  // Check for digit requirement
  if (patternString.includes('(?=.*[0-9])')) {
    infoParts.push('at least one digit');
  }

  // Check for special characters
  if (patternString.includes('(?=.*[@#$%^&*!])')) {
    infoParts.push('at least one special character (@#$%^&*!)');
  }

  // Check for upper and lower case letters
  const hasLowerCase: boolean = patternString.includes('(?=.*[a-z])');
  const hasUpperCase: boolean = patternString.includes('(?=.*[A-Z])');
  if (hasLowerCase && hasUpperCase) {
    infoParts.push('both uppercase and lowercase letters');
  } else if (hasLowerCase) {
    infoParts.push('at least one lowercase letter');
  } else if (hasUpperCase) {
    infoParts.push('at least one uppercase letter');
  }

  const lengthMatch: RegExpMatchArray | null =
    patternString.match(/{(\d+),(\d+)}/);
  if (lengthMatch) {
    const minLength: string = lengthMatch[1];
    const maxLength: string = lengthMatch[2];
    infoParts.push(`between ${minLength} and ${maxLength} characters long`);
  } else if (patternString.match(/{(\d+),}/)) {
    const minLength: string = patternString.match(/{(\d+),}/)![1];
    infoParts.push(`at least ${minLength} characters long`);
  } else if (patternString.match(/{,(\d+)}/)) {
    const maxLength: string = patternString.match(/{,(\d+)}/)![1];
    infoParts.push(`up to ${maxLength} characters long`);
  }

  const infoMessage = `Password must contain ${infoParts.join(', ')}.`;

  return infoMessage;
};
