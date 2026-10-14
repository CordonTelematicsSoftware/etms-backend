const regularExpressions = {
  email: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i,
  password: /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*\W)(?!.* ).{8,16}$/,
  newPassword: /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*\W)(?!.* ).{8,16}$/,
  alphabetsNumbers: /^[a-zA-Z0-9]+$/,
  alphabetsOnly: /^[^\d!@#$%^&*()_+={}|[\]\\:";!'<>?,./]+$/,
  englishAlphabetsOnly: /^[a-zA-Z ]*$/,
  address: /^[a-zA-Z0-9/,.; ]+$/,
  name: /^[^\d!@#$%^&*()_+={}|[\]\\:";'<>?,./]+$/,
  dob: /^\d{2}\/\d{2}$/,
  numbers: /^[0-9]+$/,
  code: /^[a-zA-Z0-9\s\-]+$/,
};

export default regularExpressions;
