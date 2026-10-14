export const is18YearsOrOlder = (birthDate) => {
  // Convert the input date to a Date object
  const birth = new Date(birthDate);
  birth.setHours(0, 0, 0, 0);
  // Get the current date
  const today = new Date();
  //   today.setHours(0, 0, 0, 0);
  // Calculate the difference in years, months, and days
  const yearDiff = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  // Check if the person is exactly 18 years or older
  if (yearDiff > 18) {
    return true;
  } else if (yearDiff === 18) {
    // Check if months and days indicate they are still 18 or more
    if (monthDiff > 0 || (monthDiff === 0 && dayDiff >= 0)) {
      return true;
    }
  }

  // If not, return false
  return false;
};
