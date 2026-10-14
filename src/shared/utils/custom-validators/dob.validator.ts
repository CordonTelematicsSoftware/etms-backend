import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class Is18YearsOldConstraint implements ValidatorConstraintInterface {
  validate(dob: any): boolean {
    const birthDate = new Date(dob);
    const today = new Date();

    // Calculate the person's age based on the difference in years, months, and days
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();

    // Adjust age if the birth month and day haven't occurred yet in the current year
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      return age - 1 >= 18;
    }
    return age >= 18;
  }

  defaultMessage(): string {
    return 'You must be at least 18 years old';
  }
}

export function Is18YearsOld(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: Is18YearsOldConstraint,
    });
  };
}
